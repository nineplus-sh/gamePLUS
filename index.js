const express = require('express')
const app = express()
const cors = require('cors');
const {join} = require("node:path");
const mongoose = require("mongoose");
const cookieParser = require('cookie-parser');
const multiparty = require('multiparty');
const fs = require('fs');
const {Schema} = require("mongoose");

const port = 4146
app.use(express.static('public/resources'));
app.set('views', join(__dirname, "public"));
app.set('view engine', 'ejs');
require('dotenv').config();

app.use(cookieParser());
app.use((req, res, next) => {
    if (req.cookies.admin === process.env.ADMIN_PASSWORD) req.admin = true;
    next()
})

app.get('/', (req, res) => {
    res.render('index', {isAdmin: req.admin});
});

app.get('/create', (req, res) => {
    if(!req.admin) res.redirect("/");
    res.render('gamecreate');
});

const GameSchema = new Schema({
    name: String,
    icon: Buffer,
    executables: Array
});
GameSchema.index({name: 'text'});
const Game = mongoose.model('Game', GameSchema);

app.post('/create', (req, res) => {
    if(!req.admin) res.sendStatus(999);

    new multiparty.Form().parse(req, async function(err, fields, files) {
        const game = new Game();
        game.name = fields.gamename[0];
        game.icon = fs.readFileSync(files.icon[0].path);
        game.executables = []

        Object.keys(fields).forEach(entry => {
            if(entry.startsWith("executable_platform_")) {
                let executableIndex = entry.split("executable_platform_")[1];

                game.executables.push({
                    name: fields[`executable_name_${executableIndex}`][0],
                    arguments: fields[`executable_arguments_${executableIndex}`][0],
                    platform: fields[`executable_platform_${executableIndex}`][0],
                })
            }
        })

        await game.save();
        res.status(200).send("Yay, new yummy game! :D");
    });
});

app.get('/search', async (req, res) => {
    const find = await Game.find({$text: {$search: req.query.game}}).exec();
    res.render('search', {find});
});

app.get('/game/:id', async (req, res) => {
    res.render('game');
});

app.get('/game/:id/icon', async (req, res) => {
    const game = await Game.findById(req.params.id).exec();

    res.contentType('image/png');
    res.set("Content-Disposition", "inline;");
    res.status(200).send(game.icon);
});

async function startApp() {
    await mongoose.connect(process.env.MONGODB_URL);
    app.listen(port, () => {
        console.log(`gamePLUS listening on port ${port}`)
    })
}
startApp();