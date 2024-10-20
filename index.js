const rateLimit = require("express-rate-limit")
const express = require('ultimate-express')
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
const expressLayouts = require('express-ejs-layouts');
const compression = require('compression');
const { constants: zConocoNoconocoConZstantan } = require("node:zlib");

const port = 4146
app.use(compression({
    level: zConocoNoconocoConZstantan.Z_BEST_COMPRESSION,
    filter: (req, res) => {
        if (!req.url.startsWith("/api/games") return false;
        return compression.filter(req, res);
    }
}));
app.use(express.json());
app.use(express.static('public/resources'));
app.set('trust proxy', 1);
app.set('views', join(__dirname, "public"));
app.set('view engine', 'ejs');
app.use(expressLayouts);
require('dotenv').config();

app.use(cookieParser());

app.use((req, res, next) => {
    if (req.cookies.admin === process.env.ADMIN_PASSWORD) req.admin = true;
    res.set("tdm-policy", "https://www.nineplus.sh/legal/tdm.json")
    res.set("tdm-reservation", "1")
    res.set("x-robots-tag", "noai")
    next()
})
app.get('/.well-known/tdmrep.json', (req, res) => {res.redirect("https://www.nineplus.sh/.well-known/tdmrep.json")})
app.get('/robots.txt', (req, res) => {res.redirect("https://www.nineplus.sh/robots.txt")})

const GameSchema = new Schema({
    name: String,
    icon: Buffer,
    iconnn: Boolean,
    executables: Array
});
GameSchema.index({name: 'text'});
const Game = mongoose.model('Game', GameSchema);
const SuggestionSchema = new Schema({
    executable: String,
    arguments: String,
    platform: String
});
const Suggestion = mongoose.model('Suggestion', SuggestionSchema);

function visualError(code, res) {
    if(code === 404) {
        res.status(404).render("error", {"image": "/idunno.png", "title": "I ate it", "description": ""});
    } else if (code === 403) {
        res.status(403).render("error", {"image": "/authenticate.png", "title": "Password required", "description": `
            <form onsubmit="event.preventDefault();document.cookie=\`admin=\${mysupersecretpassword.value}\`;document.location.reload()">
                <input type="password" id="mysupersecretpassword">
            </form>
        `});
    } else if (code === 500) {
        res.status(500).render("error", {"image": "/crashplus.png", "title": "Server puked", "description": ""});
    }
}
app.use(async (req, res, next) => {
    res.locals.showers = await Game.find().select("-icon").sort({_id: -1}).limit(9).exec();

    const quotes = [
        `“average person plays more than 5 different games every year” factoid actualy just statistical error. average person plays less. gamePLUS Georg, who lives in cave & plays all his ${await Game.countDocuments({})} games, is an outlier adn should not have been counted`
    ]

    res.locals.quote = quotes[Math.floor(Math.random() * quotes.length)];
    next();
})

app.get("/error", (req,res) => {
    throw new Error("Wah!")
})

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
    if(!req.admin) return visualError(403, res);
    res.render('gamecreate');
});

async function processGame(game, fields, files) {
    let iconData;
    let iconType;

    if(fields.suggestion_id[0]) {
        await Suggestion.findByIdAndDelete(fields.suggestion_id[0])
    }

    if(files.icon[0].size > 0) {
        iconData = fs.readFileSync(files.icon[0].path);
        iconType = files.icon[0].headers["content-type"];
    } else if(fields.iconurl[0]) {
        const iconRequest = await fetch(fields.iconurl[0]);
        iconData = await Buffer.from(await iconRequest.arrayBuffer())
        iconType = iconRequest.headers.get("content-type");
    }
    if(iconType === "image/x-icon" || iconType === "image/vnd.microsoft.icon") {
        iconData = await icoToPng(iconData, 512)
    }

    if(iconData) game.icon = iconData;
    game.name = fields.gamename[0];
    game.iconnn = !!(fields.iconnn && fields.iconnn[0] === "on");
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
    const find = await Game.find({$text: {$search: req.query.game}}).select("-icon").exec();
    res.render('search', {find});
});

app.get('/game/:id', async (req, res) => {
    if(!mongoose.isValidObjectId(req.params.id)) return visualError(404, res);
    const game = await Game.findById(req.params.id).select("-icon").exec();
    if(!game) return visualError(404, res);
    res.render('game', {game, isAdmin: req.admin, isNotable: req.query.created});
});

app.get('/game/:id/edit', async (req, res) => {
    if (!req.admin) return visualError(403, res);

    const game = await Game.findById(req.params.id).select("-icon").exec();
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

app.get('/game/:id/icon', async (req, res, next) => {
    const game = await Game.findById(req.params.id).exec();
    if(!game) return res.status(404);

    res.contentType('image/png');
    res.set("Content-Disposition", "inline;");

    try {
        res.status(200).send(
            req.query.size ?
                await sharp(game.icon).resize(parseInt(req.query.size), null, {
                    withoutEnlargement: true,
                    kernel: req.query.pixel || game.iconnn ? "nearest" : "lanczos3"
                }).toBuffer()
                : game.icon
        );
    } catch(err) {
        console.error(err);
        res.status(500).sendFile(__dirname + "/public/resources/fallback.png");
    }
});

app.get('/games', async (req, res) => {
    res.render("allgames", {games: await Game.find({}).sort({"name": 1}).select("-icon").exec()})
});
app.get('/api/games', cors(), async (req, res) => {
    const games = await Game.find(req.query.platform ? {
        executables: {
            $elemMatch: {
                platform: req.query.platform
            }
        }
    } : {}).select("-icon").exec();

    const strippedGames = games.map(game => {
        const filteredExecutables = game.executables.filter(executable => {
            const thePlatform = executable.platform;

            if(executable.arguments === "") delete executable.arguments;
            if(req.query.platform) delete executable.platform;
            return !req.query.platform || thePlatform === req.query.platform;
        });

        return {
            _id: game._id,
            name: game.name,
            executables: filteredExecutables
        };
    })

    res.json(strippedGames);
})

app.get('/learn', async (req, res) => {
    const sampleGame = (await Game.aggregate([{$match: {"executables.platform": "win32"}}, {$sample: { size: 1 }}]))[0]
    res.render('learn', {sampleGame});
});

app.get('/steam/:search', async (req, res) => {
    if(!req.admin || !process.env.SGDB_KEY) return res.sendStatus(999);
    const { default: SGDB } = await import('steamgriddb');
    const client = new SGDB(process.env.SGDB_KEY);

    const searchResults = await client.searchGame(req.params.search);
    if(searchResults.length === 0) return res.status(404).send({"message": "SteamGridDB did not recognize this game."});
    const filterizedSearchResults = searchResults.filter(result => result.types.includes("steam"));
    const searchResult =
        searchResults[0].types.includes("steam") ?
            searchResults[0]
        :
        filterizedSearchResults.length > 0 && searchResults[0].name === filterizedSearchResults[0].name
        && filterizedSearchResults[0].types.includes("steam") ?
            filterizedSearchResults[0]
        : null

    if(!searchResult) return res.status(404).send({"message": "SteamGridDB recognized this game, but the Steam data is missing, so gamePLUS cannot autofill."});

    const steamAppId = (await client.getGame({type: "id", id: searchResult.id}, {"platformdata": ["steam"]})).external_platform_data?.steam?.[0].id;
    if(!steamAppId) return res.status(404).send({"message": "SteamGridDB recognized this game as a Steam game, but the data wasn't actually sent. This shouldn't happen."})
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

const suggestLimit = rateLimit({
    windowMs: 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
})
app.options('/api/suggest', cors({allowedHeaders:["Content-Type"]}))
app.post('/api/suggest', cors({allowedHeaders:["Content-Type"]}), suggestLimit, async (req, res) => {
    let suggestion = new Suggestion();
    suggestion.executable = req.body.executable;
    suggestion.arguments = req.body.arguments;
    suggestion.platform = req.body.platform;
    await suggestion.save();
    res.sendStatus(200);
});

app.get('/suggestions', async (req, res) => {
    if (!req.admin) return visualError(403, res);
    res.render("suggestions", {suggestions: await Suggestion.find({}).exec()})
})
app.delete('/suggestions/:id', async (req, res) => {
    if (!req.admin) return res.sendStatus(999);
    await Suggestion.findByIdAndDelete(req.params.id);
    res.sendStatus(200);
})

app.all('*', (req, res) => {
    return visualError(404, res);
})
app.use((err, req, res, next) => {
    console.error(err.stack);
    return visualError( 500, res);
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
