#!/usr/bin/env node
import * as fs from "fs"
import * as path from "path"
import * as OBC from "@thatopen/components"
import * as env from "dotenv"
import { CohereClient } from 'cohere-ai';
import * as prompt from '@inquirer/prompts';

function getKey() {
  env.config()
  return process.env.APIKEY
}

function initAI(apiKey) {
  return new CohereClient({
    token: apiKey
  })
}

function readFile(joinedPath) {
  return fs.readFileSync(joinedPath)
}

function getFiles() {
	// Get the last argument from the vector (the path to the files)
  const input = process.argv[2]

	// Indicate usage
  if (!input) {
    throw new Error('Usage: bcfai-chat <path/to/bcf/files>')
  }

  let files
  try {
	  // Read directory and filter needed files
    files = fs.readdirSync(
      input
    ).filter(file => path.extname(file).toLowerCase() === '.bcf')
  } catch {
      throw new Error('Insert a valid directory.')
  }

  if (files.length === 0) {
      throw new Error(`No BCF files found in ${input}`)
  }

	// Return the full path of the file
  return files.map(file => path.join(input, file))
}

// Instantiate the engine and get the topics component
function getComponents() {
  const components = new OBC.Components()
  return components.get(OBC.BCFTopics)
}

// De data comes from the readFile function
// Gets turned into a int array and loaded to the engine.
async function loadTopics(data) {
  const bcf = getComponents()
  const buffer = new Uint8Array(data)
  const bcfData = await bcf.load(buffer)
  return JSON.stringify(bcfData.topics)
}

async function makeRequest(stringData) {

  // Include an array to store the messages.
  const messages = []
  const key = getKey()
  const cohere = initAI(key)
  
  // This is the structure needed for input prompt
  const userPrompt = {
    name: 'prompt', // A name
    type: 'string', // The type of the input
    message: 'Write your prompt:' // Message to be displayed
  }

  //Create an object called questions
  const questions = {
    name: 'actionToTake',
    type: 'list',
    message: 'Select one:',
    choices: ['Ask Something', 'Export last message to JSON', 'Export Chat', 'Exit']
  }

  while (true) {

    const question = await prompt.select(questions)
    
    if (question==="Ask Something") {
      // There are other options to use with prompt but this one works just fine.
      const input = await prompt.input(userPrompt)
  
      if (!input) {
        console.log('No input given, try writing something.')
        continue
      }
      
      // This prompt can be tuned, but it works good to 
      // get the conversation with cohere going
      // stringData is the information from the topics.
      const coherePrompt = {
        message: `Based on the following data ${stringData}
        You should only create the response based on the information given.
        Information that is not found on ${stringData} should not be presented on the result
        your job is to answer the following question: ${input}.
        If the question is empty, say that you can't process empty questions and to try again.`
      }
      const response = await cohere.chat(coherePrompt)
      
      const responseText = response.text
      
      console.log(response.text)
  
      // Push an object in this format to the messages array
      messages.push(
        {
          user: input,
          cohere: responseText
        }
      )
    } else if (question==="Export last message to JSON") {
      if (!messages) {
        console.log('No last message to export')
        continue
      }

      const lastMessage = messages[messages.length - 1];

      const stringifiedLastMessage = JSON.stringify(lastMessage, null, 2)

      const coherePromptLastMessage = {
        message: `Based on the following data ${stringifiedLastMessage}
        The response should keep the structure
        {
          user
          cohere
        }
        You should only create a JSON structure from these data.`
      }

      const responseLastMessage = await cohere.chat(coherePromptLastMessage)

      console.log(responseLastMessage.text)

    } else if (question==='Export Chat') {
      if (!messages) {
        console.log('No chat to export')
        continue
      }

      const fileName = 'CohereChat.json'
      const stringifiedMessages = JSON.stringify(messages, null, 2)
      fs.writeFileSync(fileName, stringifiedMessages)
    
      console.log(`Chat exported to ${process.cwd()}\\\\${fileName}`)

    } else if (question==='Exit') {
      break
    }
  }
}

async function chat() {
  const filesPath = getFiles()
  let stringData

  for (const file of filesPath) {
    const fileData = readFile(file)
    stringData += await loadTopics(fileData)
  }

  await makeRequest(stringData)
}

await chat()