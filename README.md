# CodeScan for Visual Studio Code

CodeScan is a Visual Studio Code extension that provides on-the-fly feedback to developers on new bugs and quality issues injected into Apex and VisualForce code.

## How it works

Simply open a Apex or VisualForce file, start coding, and you will start seeing issues reported by CodeScan. Issues are highlighted in your code, and also listed in the 'Problems' panel.

![sonarlint on-the-fly](images/sonarlint-vscode.gif)

You can access the detailed rule description directly from your editor, using the provided contextual menu.

![rule description](images/sonarlint-rule-description.gif)

You can find all available rules descriptions on the dedicated [CodeScan website](http://www.code-scan.com/tutorials/vscode).

# Prerequisites
You will need:

* A working SonarQube (6.1+) installation
* A recent version of VS Code installed (v1.12 or above).
* A licensed version of CodeScan plugin to get started (see <a href="https://www.code-scan.com/overview/installing-all/" >here</a>

# Installation

* In VS Code, go to the Marketplace and download CodeScan.

* Restart VS Code.

* In the VS Code User Settings, copy over the CodeScan section to the right hand pane and edit the following:

  - Add the parameter "login" and "password" and assign it your SonarQube username/password. (Alternatively use the "token" parameter and generate a token in SonarQube)
  - Replace the value of "url" with your SonarQube server URL.
  - Replace the value of "id" with a value you will remember.
  - Optionally replace the value of "organization" with the organization key of the SonarQube server you are connecting to

* Now hit Ctrl+Shift+P (Windows/Linux) or Shift+Command+P(Mac) to open the Command Palette.

* Type in CodeScan to bring up the CodeScan commands and click "CodeScan: Create a 'sonarlint.json' file".

* Open the sonarlint.json file.
  - Change the value of "serverId" to the id you set in the VS Code User Settings.
  - Change the value of "projectKey" to the name of the associated project in SonarQube.

* Open the Command Palette again and run "CodeScan: Update all project bindings"

# Troubleshooting

You can check for the analysis status from the output window under CodeScan.

You can check for any errors here by going to Help > Toggle Developer Tools to bring up the console.

## Contributions and license

CodeScan for Visual Studio Code is open source under the LGPL v3 license. Feel free to submit Pull Requests.

## Feedback

The preferred way to discuss about CodeScan is by posting on the [CodeScan Support Page](http://www.code-scan.com/help/support). Feel free to ask questions, report issues, and give suggestions.
