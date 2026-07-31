// Repo coordinates + a couple of brand constants. Contacts now live in
// src/data/site.json (edited via the admin) and are read through CONTACTS in
// src/data/content.ts — do NOT re-add contact fields here.
export const SITE = {
  owner: 'volossoftwaredevelopment',
  repo: 'rndyvisuals',
  branch: 'main',
  manifestRepoPath: 'src/data/videos.json',
  brand: 'rndyvisuals',
  instagram: 'https://www.instagram.com/rndyvisuals/',
  credit: 'Volos Software Development',
  creditUrl: 'https://volossoftwaredevelopment.github.io/volossoftwareweb/',
} as const
