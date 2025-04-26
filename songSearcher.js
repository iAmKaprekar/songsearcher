const path = require('path');
const fs = require('fs');
const api = require("youtube-search-api");
const { application } = require('express');
const { resourceLimits } = require('worker_threads');

const playlistText = fs.readFileSync(path.resolve(__dirname, "playlist.txt")).toString('utf8');

let phase = 0;
let str = '';

class Song {
  constructor (album, title, artist) {
    this.album = album;
    this.title = title;
    this.artist = artist;
  }
}

const specialCharacters = {
  ":": "%3A",
  "/": "%2F",
  "?": "%3F",
  "#": "%23",
  "[": "%5B",
  "]": "%5D",
  "@": "%40",
  "!": "%21",
  "$": "%24",
  "&": "%26",
  "'": "%27",
  "(": "%28",
  ")": "%29",
  "*": "%2A",
  "+": "%2B",
  ",": "%2C",
  ";": "%3B",
  "=": "%3D",
  "%": "%25",
}

const phases = ['album', "title", "artist"]
const songs = [];
let song = new Song();

for (const char of playlistText) {
  if (char === '\t') {
    song[phases[phase]] = str;
    str = '';
    phase += 1;
  }
  else if (char === '\n') {
    song[phases[phase]] = str;
    str = '';
    songs.push(song);
    song = new Song();
    phase = 0;
  }
  else {
    if (specialCharacters[char]) str += specialCharacters[char];
    else str += char;
  }
}

const results = [];

class Result {
  constructor (id, certainty) {
    this.id = id;
    this.certainty = certainty;
  }
}

class Video {
  constructor (id, title) {
    this.id = id;
    this.title = title;
  }
}

const search = async (searchTerm) => {
  console.log(`SEARCHING:   ${searchTerm}`);
  const response = await api.GetListByKeyword(searchTerm);
  if (!response.items) {
    console.log("FAILED REQUEST");
    return false;
  }
  if (!response.items[0]) return false;
  const video = response.items[0];
  return new Video(video.id, video.title);
}

const loopSearch = async() => {
  songLoop: for (const song of songs) {
    let certainty = 5;
    while (certainty > 0) {
      let searchTerm = '';
      if (song.album) {
        if (certainty === 5 || certainty === 3) searchTerm += `"${song.album}" `;
        else searchTerm += `${song.album} `;
      }
      if (certainty === 5 || certainty === 3) searchTerm += `"${song.title}" "${song.artist}"`;
      else searchTerm += `${song.title} ${song.artist}`;
      if (certainty > 3) searchTerm += ` "topic"`;
      let searchResult = await search(searchTerm, certainty, song.title);
      console.log(`RECEIVED:    ${searchResult ? searchResult.title : "-"}`);
      let resultTitle = '';
      for (const char of searchResult.title) {
        if (specialCharacters[char]) resultTitle += specialCharacters[char];
        else resultTitle += char;
      }
      if (searchResult) {
        if (!resultTitle.includes(song.title)) {
          certainty--;
          if (certainty > 1) continue;
        }
        if (resultTitle.includes("Video") && !song.title.includes("Video")) certainty--;
        results.push(new Result(searchResult.id, certainty));
        continue songLoop;
      }
      certainty--;
    }
    results.push(new Result("N/A", 0));
  }  
}

loopSearch().then(
  () => {
    console.log(results);
    let resultsString = '';
    for (const result of results) {
      resultsString += `${result.certainty}\thttps://www.youtube.com/watch?v=${result.id}\n`;
    }
    fs.writeFileSync(path.resolve(__dirname, "links.txt"), resultsString);
  }
);