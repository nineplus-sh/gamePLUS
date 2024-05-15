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

const GameSchema = new Schema({
    name: String,
    icon: Buffer,
    executables: Array
});
GameSchema.index({name: 'text'});
const Game = mongoose.model('Game', GameSchema);

app.get('/', async (req, res) => {
    const graphData = await Game.aggregate([
        {
            $project: {
                day: { $dateToString: { format: "%Y-%m-%d", date: { $toDate: "$_id" } } }
            }
        },
    {
        $group: {
            _id: '$day',
            count: { $sum: 1 }
        }
    },
    {
        $setWindowFields: {
            sortBy: { _id: 1 },
            output: {
                total: {
                    $sum: '$count',
                    window: {
                        documents: ["unbounded", "current"]
                    }
                }
            }
        }
    },
    {
        $project: {
            x: '$_id',
            y: '$total',
            _id: 0
        }
    },
    { $sort: { x: 1 } }
]);


    let xLabels = []
    let yLabels = []

    xLabels.push("2024-05-13");
    yLabels.push(0);

    graphData.forEach(function(data) {
        xLabels.push(data.x);
        yLabels.push(data.y);
    })

    res.render('index', {isAdmin: req.admin, xLabels: JSON.stringify(xLabels), yLabels: JSON.stringify(yLabels)});
});

app.get('/create', (req, res) => {
    if(!req.admin) res.redirect("/");
    res.render('gamecreate');
});

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
    console.log(find[0])
    res.render('search', {find});
});

app.get('/game/:id', async (req, res) => {
    const game = await Game.findById(req.params.id).exec();
    res.render('game', {game});
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
