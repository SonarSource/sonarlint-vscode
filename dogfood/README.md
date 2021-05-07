# SonarLint Dogfood 🥫

Get notified 📢 about new dogfooding builds 🥫 and install them in one click 👍.

## Features

* Checks at startup and at regular intervals if a new dogfooding build is available on Artifactory
* Shows a notification with a handy install/update button
* Takes away the hassle of uninstalling/reinstalling the extension

## Extension Settings

* `sonarlint-dogfood.check.disable`: disable automated checks (default is enabled)
* `sonarlint-dogfood.check.periodInSeconds`: number of seconds before next automated check (defaults to one hour)

## Contributing

This extension has been successfully built with Node 14.16.1 LTS (Fermium) and NPM 6.14.11. Your mileage may vary.

### Building the VSIX

    npm install && npx vsce package

### Running tests

    npm run test

## Feedback

Please create a thread in the [Dogfood SonarLint category on Discuss](https://discuss.sonarsource.com/c/dogfood/sl/39).
