# Playlist generator

This is a chatbot that is able to generate playlists.

## About
LLMs are used to parse the user chat inputs to figure out what songs are desired,
before querying for that genre of songs online.

The chatbot can do the following:
- Infer the genre of the playlist
- Infer the desired length of the playlist to generate (or use a default of 5 songs)
- Continue onwards from previous playlists
- Filter out explicit songs
- Generate playlists using the above features 

Whilst the chatbot will ask for user approval to recommend explicit songs,
it can also infer when the user has already made their preferences regarding this clear.

Different accounts are used to provide isolated chats for different users.

## Using the website online:
View https://cf-ai-assignment-2026.32ppatel.workers.dev/

You will have to create an account to use the service.

## Using the website locally:

- Clone the repository from https://github.com/PP6464/cf_ai_assignment_2026
- Run  `npm install` then `npm run start`
- Visit `http://localhost:{port_number}/` (default is port `5173`)

You will have to create an account to use the service.