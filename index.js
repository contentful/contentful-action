const core = require('@actions/core');
const wait = require('./wait');


// most @actions toolkit packages have async methods
async function run() {
  try {
    const {promisify} = require('util');
    const {readdir} = require('fs');
    const readdirAsync = promisify(readdir);
    const path = require('path');
    const { createClient } = require('contentful-management');
    const {default: runMigration} = require('contentful-migration/built/bin/cli');

    // utility fns
    const getVersionOfFile = (file) => file.replace('.js', '').replace(/_/g, '.');
    const getFileOfVersion = (version) => version.replace(/\./g, '_') + '.js';

    //
    // Configuration variables
    //
    const SPACE_ID = process.env.SPACE_ID;
    const GITHUB_REF = process.env.GITHUB_REF;
    const MANAGEMENT_API_KEY = process.env.MANAGEMENT_API_KEY;

    const githubRefSplit = GITHUB_REF.split('/');
    const ENVIRONMENT_INPUT = githubRefSplit[githubRefSplit.length - 1];

    const MIGRATIONS_DIR = process.env.GITHUB_WORKSPACE + "/migrations"

    const client = createClient({
      accessToken: MANAGEMENT_API_KEY
    });
    const space = await client.getSpace(SPACE_ID);

    var ENVIRONMENT_ID = "";

    let environment;
    console.log('Running with the following configuration');
    // ---------------------------------------------------------------------------
    if (ENVIRONMENT_INPUT == 'master'){
      console.log(`Running on master.`);
      ENVIRONMENT_ID = "master-".concat(getStringDate());
    }else{
      console.log('Running on feature branch');
      ENVIRONMENT_ID = "GH-".concat(ENVIRONMENT_INPUT);
    }
    console.log(`ENVIRONMENT_ID: ${ENVIRONMENT_ID}`);

    // ---------------------------------------------------------------------------

    console.log(`Checking for existing versions of environment: ${ENVIRONMENT_ID}`);

    try {
      environment = await space.getEnvironment(ENVIRONMENT_ID);
      if (ENVIRONMENT_ID != 'master'){
        await environment.delete();
        console.log('Environment deleted');
      }
    } catch(e) {
      console.log('Environment not found');
    }

    // ---------------------------------------------------------------------------
    if (ENVIRONMENT_ID != 'master'){
      console.log(`Creating environment ${ENVIRONMENT_ID}`);
      environment = await space.createEnvironmentWithId(ENVIRONMENT_ID, { name: ENVIRONMENT_ID });
    }
    // ---------------------------------------------------------------------------
    const DELAY = 3000;
    const MAX_NUMBER_OF_TRIES = 10;
    let count = 0;

    console.log('Waiting for environment processing...')

    while (count < MAX_NUMBER_OF_TRIES) {
      const status = (await space.getEnvironment(environment.sys.id)).sys.status.sys.id;

      if (status === 'ready' || status === 'failed') {
        if (status === 'ready') {
          console.log(`Successfully processed new environment (${ENVIRONMENT_ID})`);
        } else {
          console.log('Environment creation failed');
        }
        break;
      }

      await new Promise(resolve => setTimeout(resolve, DELAY));
      count++;
    }


    // ---------------------------------------------------------------------------
    console.log('Update API Keys to allow access to new environment');
    const newEnv = {
      sys: {
        type: 'Link',
        linkType: 'Environment',
        id: ENVIRONMENT_ID
      }
    }

    const {items: keys} = await space.getApiKeys();
    await Promise.all(keys.map(key => {
      console.log(`Updating - ${key.sys.id}`);
      key.environments.push(newEnv);
      return key.update();
    }));

    // ---------------------------------------------------------------------------
    console.log('Set default locale to new environment');
    const defaultLocale = (await environment.getLocales()).items
      .find(locale => locale.default).code;

    // ---------------------------------------------------------------------------
    console.log('Read all the available migrations from the file system');
    const availableMigrations = (await readdirAsync(MIGRATIONS_DIR))
      .filter(file => /^\d+?\.js$/.test(file))
      .map(file => getVersionOfFile(file));

    // ---------------------------------------------------------------------------
    console.log('Figure out latest ran migration of the contentful space');
    const {items: versions} = await environment.getEntries({
      content_type: 'versionTracking'
    });

    if (!versions.length || versions.length > 1) {
      throw new Error(
        'There should only be one entry of type \'versionTracking\''
      );
    }

    let storedVersionEntry = versions[0];
    const currentVersionString = storedVersionEntry.fields.version[defaultLocale];

    // ---------------------------------------------------------------------------
    console.log('Evaluate which migrations to run');
    const currentMigrationIndex = availableMigrations.indexOf(currentVersionString);

    if (currentMigrationIndex === -1) {
      throw new Error(
        `Version ${currentVersionString} is not matching with any known migration`
      );
    }
    const migrationsToRun = availableMigrations.slice(currentMigrationIndex + 1);
    const migrationOptions = {
      spaceId: SPACE_ID,
      environmentId: ENVIRONMENT_ID,
      accessToken: MANAGEMENT_API_KEY,
      yes: true
    };

    // ---------------------------------------------------------------------------
    console.log('Run migrations and update version entry');
    while(migrationToRun = migrationsToRun.shift()) {
      const filePath = path.join(MIGRATIONS_DIR, getFileOfVersion(migrationToRun));
      console.log(`Running ${filePath}`);
      await runMigration(Object.assign(migrationOptions, {
        filePath
      }));
      console.log(`${migrationToRun} succeeded`);

      storedVersionEntry.fields.version[defaultLocale] = migrationToRun;
      storedVersionEntry = await storedVersionEntry.update();
      storedVersionEntry = await storedVersionEntry.publish();

      console.log(`Updated version entry to ${migrationToRun}`);
    }

    // ---------------------------------------------------------------------------
    console.log('Checking if we need to update master alias');
    if (ENVIRONMENT_INPUT == 'master'){
      console.log(`Running on master.`);
      console.log(`Updating master alias.`);
      await space.getEnvironmentAlias('master')
        .then((alias) => {
          alias.environment.sys.id = ENVIRONMENT_ID
          return alias.update()
        })
        .then((alias) => console.log(`alias ${alias.sys.id} updated.`))
        .catch(console.error);
      console.log(`Master alias updated.`);
    }else{
      console.log('Running on feature branch');
      console.log('No alias changes required');
    }

    console.log('All done!');
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

run()


function getStringDate(){
  var d = new Date();
  function pad(n){return n<10 ? '0'+n : n}
  return d.toISOString().substring(0, 10)
  + '-'
  + pad(d.getUTCHours())
  + pad(d.getUTCMinutes())
}
