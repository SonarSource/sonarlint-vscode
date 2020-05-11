# SonarLint for Visual Studio Code

SonarLint is a free IDE extension that lets you fix coding issues before they exist! Like a spell checker, SonarLint highlights Bugs and Security Vulnerabilities as you write code, with clear remediation guidance so you can fix them before the code is even committed. SonarLint in VS Code supports analysis of JavaScript, TypeScript, Python, Java, HTML & PHP code, and you can install it directly from the VS Code Marketplace!

## How it works

Simply open a JS, TS, Python, Java, HTML or PHP file, start coding, and you will start seeing issues reported by SonarLint. Issues are highlighted in your code, and also listed in the 'Problems' panel.

![sonarlint on-the-fly](images/sonarlint-vscode.gif)

You can access the detailed rule description directly from your editor, using the provided contextual menu.

![rule description](images/sonarlint-rule-description.gif)

## Static Analysis Rules

Out of the box, SonarLint automatically checks your code against the following rules:

- [JavaScript rules](https://rules.sonarsource.com/javascript)
- [TypeScript rules](https://rules.sonarsource.com/typescript)
- [Python rules](https://rules.sonarsource.com/python)
- [Java rules](https://rules.sonarsource.com/java)
- [HTML rules](https://rules.sonarsource.com/html)
- [PHP rules](https://rules.sonarsource.com/php)

The full list of available rules is visible in the "SonarLint Rules" view in the explorer, where you can activate and deactivate rules to match your conventions. SonarLint will also show a code action on each issue to quickly deactivate the corresponding rule.

## Requirements

The SonarLint language server needs a Java Runtime (JRE) 8 or 11. If one is already installed on your computer, SonarLint should automatically find and use it.

If a suitable JRE cannot be found at the usual places, SonarLint will ask for your permission to download and manage its own version.

Finally, you can explicitly set the path where the JRE is installed using the `sonarlint.ls.javaHome` variable in VS Code settings. For instance:

    {
        "sonarlint.ls.javaHome": "C:\\Program Files\\Java\\jre1.8.0_131"
    }

To analyze JavaScript and TypeScript, SonarLint will also need Node.js.

To enable the support for Java, you need the [Language support for Java](https://marketplace.visualstudio.com/items?itemName=redhat.java) VSCode extension (version 0.56.0 or higher).

The support for Apex and PL/SQL is only available together with SonarQube/SonarCloud. For Apex, you'll also need the [Salesforce Extension Pack](https://marketplace.visualstudio.com/items?itemName=salesforce.salesforcedx-vscode) VSCode extension.

## Connected mode

You can connect SonarLint to SonarQube >= 6.7 or SonarCloud and bind your workspace folders to a SonarQube/SonarCloud project to benefit from the same rules and settings that are used to inspect your project on the server. SonarLint then hides in VSCode the issues that are marked as **Won’t Fix** or **False Positive**.

Connected mode will also allow to unlock analysis of the following languages:

- [Apex rules](https://rules.sonarsource.com/apex)
- [PL/SQL rules](https://rules.sonarsource.com/plsql)

The first step is to configure connection details (user token, SonarQube server URL or SonarCloud organization). For security reasons, the token should not be stored in SCM with workspace settings. That's why we suggest to configure them in VSCode user settings.

Example for SonarQube:

    {
        "sonarlint.connectedMode.connections.sonarqube": [
            { "serverUrl": "https://sonarqube.mycompany.com", "token": "<generated from SonarQube account/security page>" }
        ]
    }

Example for SonarCloud:

    {
        "sonarlint.connectedMode.connections.sonarcloud": [
            { "organizationKey": "myOrgOnSonarCloud", "token": "<generated from https://sonarcloud.io/account/security/>" }
        ]
    }

The second step is to configure the project binding, either at workspace level, or in every workspace folders. Example:

    {
        "sonarlint.connectedMode.project": {
            "projectKey": "the-project-key"
        }
    }

If you plan to use multiple connections, to different SonarQube servers and/or SonarCloud organizations, simply give a unique `connectionId` to each entry, and use them as reference in the binding.

Example:

    // In user settings
    {
        "sonarlint.connectedMode.connections.sonarqube": [
            { "connectionId": "mySonar", "serverUrl": "https://sonarqube.mycompany.com", "token": "xxx" }
        ]
        "sonarlint.connectedMode.connections.sonarcloud": [
            { "connectionId": "myOrgOnSonarCloud", "organizationKey": "myOrg", "token": "yyy" }
        ]
    }

    // In project1/.vscode/settings.json
    {
        "sonarlint.connectedMode.project": {
            "connectionId": "mySonar",
            "projectKey": "the-project-key-on-sq"
        }
    }

    // In project2/.vscode/settings.json
    {
        "sonarlint.connectedMode.project": {
            "connectionId": "SonarCloud",
            "projectKey": "the-project-key-on-sc"
        }
    }

Configuring a project binding at the workspace level mutes **Won’t Fix** and **False Positive** issues in any of the project's sub-folders added to the workspace.

SonarLint keep server side data in a local storage. If you change something on the server such as the quality profile, you can trigger an update of the local storage using the "SonarLint: Update all project bindings to SonarQube/SonarCloud" command on the command palette (search for "sonarlint").

## Contributions

If you would like to see a new feature, please create a new thread in the forum ["Suggest new features"](https://community.sonarsource.com/c/suggestions/features).

Please be aware that we are not actively looking for feature contributions. The truth is that it's extremely difficult for someone outside SonarSource to comply with our roadmap and expectations. Therefore, we typically only accept minor cosmetic changes and typo fixes.

With that in mind, if you would like to submit a code contribution, please create a pull request for this repository. Please explain your motives to contribute this change: what problem you are trying to fix, what improvement you are trying to make.

Make sure that you follow our [code style](https://github.com/SonarSource/sonar-developer-toolset#code-style) and all tests are passing.

## Have Question or Feedback?

For SonarLint support questions ("How do I?", "I got this error, why?", ...), please first read the [FAQ](https://community.sonarsource.com/t/frequently-asked-questions/7204) and then head to the [SonarSource forum](https://community.sonarsource.com/c/help/sl). There are chances that a question similar to yours has already been answered. 

Be aware that this forum is a community, so the standard pleasantries ("Hi", "Thanks", ...) are expected. And if you don't get an answer to your thread, you should sit on your hands for at least three days before bumping it. Operators are not standing by. :-)

Issue tracker (readonly): https://jira.sonarsource.com/browse/SLVSCODE

## License

Copyright 2017-2020 SonarSource.

Licensed under the [GNU Lesser General Public License, Version 3.0](http://www.gnu.org/licenses/lgpl.txt)
