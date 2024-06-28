# gamePLUS
The executable mapping database used by Quarky, the world's silliest chat app.

Refer to public/learn.ejs (accessible at /learn when running the web server) for third-party licensing information.

## I want to host my own gamePLUS.
Don't. The information below is provided in case I forget how to run it myself.

## Dependencies
### MongoDB
You will need a MongoDB database to use gamePLUS. Set the `MONGODB_URL` environment variable to your connection string.
### Discord webhook
gamePLUS can log new additions to a Discord channel. To do this, simply set the `DISCORD_WEBHOOK` environment variable to a Discord webhook URL.

### Steam autofill
When adding to the database, you can press the "autofill" button to fetch executables from Steam.

You do not need Steam credentials for this, but you do need a SteamGridDB API key. Get one from https://www.steamgriddb.com/profile/preferences/api and set the `SGDB_KEY` environment variable accordingly.
### Live2D Cubism
When adding to the database, gamePLUS uses the Live2D Cubism SDK to display a Live2D Cubism model in the bottom left corner so that you don't get lonely.

For now, this integration is built around the Hiyori Momose sample model provided by Live2D Inc.

Download it from https://cubism.live2d.com/sample-data/bin/hiyori_pro/hiyori_pro_en.zip and extract the contents of the runtime folder to `public/resources/cubism/hiyori_pro`.

Next, you will need a copy of Live2D Cubism Core. Go to https://www.live2d.com/en/sdk/download/web/ and download the latest Cubism SDK for Web (**not Cubism Core for Web**). Then extract the contents of the Core folder to src/cubism/Core. You do not need the Framework as this is already in a Git submodule.

Finally, run `npm run cubism` in the command line and the Live2D Cubism script should automatically be compiled to public/resources/cubism/cubism.js.
