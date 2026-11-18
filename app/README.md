# Fifteen

A browser tap game by Devian Kapp. Each round lasts fifteen seconds. Tap the mark to score. Clouds cover the mark, and you can only score when it peeks out along an edge. When time runs out, you see your taps and can play again.

It works in a phone browser and on a desktop. This version has no ads, no account, and no payments. Your best score stays in this browser only.

## Run it on your computer

1. Install [Node.js](https://nodejs.org/) if you do not have it.
2. Open a terminal in this folder.
3. Install the project:

```bash
npm install
```

4. Start the game:

```bash
npm run dev
```

5. Open the address the terminal prints. The dev server uses port **47219**, so on this computer that is usually [http://localhost:47219](http://localhost:47219).

On a phone sharing the same Wi-Fi, open the Network address the terminal prints.

## Make a build

```bash
npm run build
npm run preview
```

`preview` serves the built files, also on port 47219.
