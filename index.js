const express = require('express')
const app = express()
const port = 4146

// TODO: NONSENSE MVP CODE REPLACE LATER LOL!
const games = require('./games.json')
app.get('/api/games', (req, res) => {
    res.header("Content-Type",'application/json');
    res.send(JSON.stringify(games));
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})