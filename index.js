const express = require('express')
const app = express()
const cors = require('cors');
const {join} = require("node:path");
const mongoose = require("mongoose");
const cookieParser = require('cookie-parser');
const multiparty = require('multiparty');
const fs = require('fs');
const {Schema} = require("mongoose");
const icoToPng = require("ico-to-png");
const nodeSteam = require("steam-user");
const steamClient = new nodeSteam();
const sharp = require("sharp");

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

    const newestGames = await Game.find().sort({ _id: -1 }).limit(12).exec();
    res.render('index', {isAdmin: req.admin, xLabels: JSON.stringify(xLabels), yLabels: JSON.stringify(yLabels), newestGames});
});

app.get('/create', (req, res) => {
    if(!req.admin) res.redirect("/");
    res.render('gamecreate');
});

async function processGame(game, fields, files) {
    let iconData;
    let iconType;

    if(files.icon[0].size > 0) {
        iconData = fs.readFileSync(files.icon[0].path);
        iconType = files.icon[0].headers["content-type"];
    } else if(fields.iconurl[0]) {
        const iconRequest = await fetch(fields.iconurl[0]);
        iconData = await Buffer.from(await iconRequest.arrayBuffer())
        iconType = iconRequest.headers.get("content-type");
    }
    console.log(iconType)
    if(iconType === "image/x-icon" ||    iconType === "image/vnd.microsoft.icon") {
        iconData = await icoToPng(iconData, 128)
    } else if(iconType === "image/png") {
        iconData = await sharp(iconData).resize({
            width: 128,
            height: 128,
            withoutEnlargement: true
        })
    }

    game.icon = iconData;
    game.name = fields.gamename[0];
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
    return game;
}

app.post('/create', (req, res) => {
    if(!req.admin) return res.sendStatus(999);

    let game = new Game();
    new multiparty.Form().parse(req, async function(err, fields, files) {
        game = await processGame(game, fields, files)

        res.redirect(`/game/${game._id}?created=true`);
        await fetch(process.env.DISCORD_WEBHOOK, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({content: `https://gameplus.nineplus.sh/game/${game._id}`}),
        });
    });
});

app.get('/search', async (req, res) => {
    const find = await Game.find({$text: {$search: req.query.game}}).exec();
    res.render('search', {find});
});

app.get('/game/:id', async (req, res) => {
    if(!mongoose.isValidObjectId(req.params.id)) return res.sendStatus(404);
    const game = await Game.findById(req.params.id).exec();
    res.render('game', {game, isAdmin: req.admin, isNotable: req.query.created});
});

app.get('/game/:id/edit', async (req, res) => {
    if (!req.admin) return res.redirect("/");

    const game = await Game.findById(req.params.id);
    if (!game) return res.status(404).send('Game not found');
    res.render('gameedit', { game });
});

app.post('/game/:id/edit', async (req, res) => {
    if(!req.admin) return res.sendStatus(999);
    let game = await Game.findById(req.params.id);
    if (!game) return res.status(404).send('Game not found');

    new multiparty.Form().parse(req, async function(err, fields, files) {
        game = await processGame(game, fields, files);
        res.redirect(`/game/${game._id}`);
    })
});

app.get('/game/:id/icon', async (req, res) => {
    const game = await Game.findById(req.params.id).exec();

    res.contentType('image/png');
    res.set("Content-Disposition", "inline;");
    res.status(200).send(game.icon);
});

app.get('/games', async (req, res) => {
    res.render("allgames", {games: await Game.find({}).sort({"name": 1}).exec()})
});
app.get('/api/games', cors(), async (req, res) => {
    const games = await Game.find({});
    res.json(games.map(g => ({ _id: g._id, name: g.name, executables: g.executables })));
})

app.get('/learn', async (req, res) => {
    const sampleGame = (await Game.aggregate([{$match: {"executables.platform": "win32"}}, {$sample: { size: 1 }}]))[0]
    res.render('learn', {sampleGame});
});

app.get('/steam/:search', async (req, res) => {
    if(!req.admin || !process.env.SGDB_KEY) return res.sendStatus(999);
    const { default: SGDB } = await import('steamgriddb');
    const client = new SGDB(process.env.SGDB_KEY);

    const searchResult = (await client.searchGame(req.params.search))[0]
    if(!searchResult) return res.sendStatus(404);

    const steamAppId = (await client.getGame({type: "id", id: searchResult.id}, {"platformdata": ["steam"]})).external_platform_data?.steam?.[0].id;
    if(!steamAppId) return res.sendStatus(404);
    const appInfo = (await steamClient.getProductInfo([parseInt(steamAppId)], [])).apps[steamAppId].appinfo

    const osOrder = ["windows", "macos", "linux"]
    const sgdbIcons = (await client.getIconsById(searchResult.id)).map((entry) => entry.url)
    return res.json({
        name: appInfo.common.name,
        executables: Object.values(appInfo.config.launch).sort((a,b) => osOrder.indexOf(a.config?.oslist) - osOrder.indexOf(b.config?.oslist)),
        depots: Object.fromEntries(
            Object.entries(appInfo.depots).filter(([key, value]) =>
                key !== "branches" && key !== "baselanguages" && key !== "workshopdepot" && !value.depotfromapp && !value.dlcappid
            )
        ),
        icons: [
            `https://cdn.cloudflare.steamstatic.com/steamcommunity/public/images/apps/${steamAppId}/${appInfo.common.clienticon}.ico`,
            ...sgdbIcons
        ],
        sgdbUrl: `https://steamgriddb.com/game/${searchResult.id}/icons`,
        steamAppId: steamAppId
    })
})

async function startApp() {
    await mongoose.connect(process.env.MONGODB_URL);
    console.log("Connected to database")
    await steamClient.logOn({anonymous: true});
    console.log("Anonymously signed into Steam")
    app.listen(port, () => {
        console.log(`gamePLUS listening on port ${port}`)
    })
}
startApp();
