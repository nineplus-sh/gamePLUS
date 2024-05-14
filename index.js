const express = require('express')
const app = express()
const cors = require('cors');
const {join} = require("node:path");
const mongoose = require("mongoose");
const cookieParser = require('cookie-parser');

const port = 4146
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

app.get('/search', (req, res) => {
    res.render('search');
});

app.get('/game/:id', (req, res) => {
    res.render('game');
});

async function startApp() {
    await mongoose.connect(process.env.MONGODB_URL);
    app.listen(port, () => {
        console.log(`gamePLUS listening on port ${port}`)
    })
}
startApp();