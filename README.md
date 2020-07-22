# Contentful Actions

An action for running migration scripts against a Contentful CLI. To learn about making changes to a content model and entries on a Contentful Space using the Contentful CLI check out our [tutorial on Scripting Migrations](https://www.contentful.com/developers/docs/tutorials/cli/scripting-migrations/). You can read our [conceptual guide](https://www.contentful.com/developers/docs/concepts/deployment-pipeline/) on how to utilize Contentful Environments inside your continuous delivery pipeline.

## Usage

See our [example usage](https://github.com/contentful-labs/contentful-action-example) in our contentful-action-example repository.

This action requires a folder labeled migration inside your repo. You should place all your migrations in this directory.

For this action to know which migrations it should run, we’ll need to track which migrations have been run by adding a version number into Contentful. We accomplish this in Contentful by creating a new content model with an ID of versionTracking that has a single short-text-field named version.

![Screenshot of Contentful Version Tracking Entry](images/version-tracking.png)

You’ll also need to create one entry of your new content model with the value 1. We’ll need to create an empty migration file to represent the initial import. Create 1.js inside your migration folder and include the following code:

```js
module.exports = function runMigration(migration) {
  return;
};
```

Going forward you can create a JavaScript file with an increasing integer such as `2.js`, `3.js` and so on. The action by default looks for a folder labeled `migration` but it's configurable via the environment variable `MIGRATIONS_DIR`.

Lastly you'll need to update your workflow file to use this action and update the settings to include your `SPACE_ID` and `MANAGEMENT_API_KEY` from Contentful. Update your `main.yml` file by adding the following step:


```yml
  uses: contentful/contentful-action@v1
  env: # Set the secret as an input
    SPACE_ID: ${{ secrets.SPACE_ID }}
    MANAGEMENT_API_KEY: ${{ secrets.MANAGEMENT_API_KEY }}
#   MIGRATIONS_DIR: ${{ secrets.MIGRATIONS_DIR }}
```

License
=======

Copyright (c) 2019 Contentful GmbH. Code released under the MIT license. See [LICENSE](LICENSE) for further details.


