# SonarLint for Visual Studio Code

SonarLint is a Visual Studio Code extension that provides on-the-fly feedback to developers on new bugs and quality issues injected into JavaScript, TypeScript, Python and PHP code.

## How it works

Simply open a JS, TS, Python or PHP file, start coding, and you will start seeing issues reported by SonarLint. Issues are highlighted in your code, and also listed in the 'Problems' panel.

![sonarlint on-the-fly](images/sonarlint-vscode.gif)

You can access the detailed rule description directly from your editor, using the provided contextual menu.

![rule description](images/sonarlint-rule-description.gif)

## Rules
Check the rules to see what SonarLint can do for you:
- [JavaScript rules](https://rules.sonarsource.com/javascript)
- [TypeScript rules](https://rules.sonarsource.com/typescript)
- [Python rules](https://rules.sonarsource.com/python)
- [PHP rules](https://rules.sonarsource.com/php)

You will benefit from the following code analyzers: [SonarJS](https://redirect.sonarsource.com/plugins/javascript.html), [SonarTS](https://redirect.sonarsource.com/plugins/typescript.html), [SonarPython](https://redirect.sonarsource.com/plugins/python.html) and [SonarPHP](https://redirect.sonarsource.com/plugins/php.html)

## Requirements

The only thing you need is a Java Runtime (JRE) 8 installed on your computer.

SonarLint should automatically find it but you can also explicitely set the path where the JRE is installed using the 'sonarlint.ls.javaHome' variable in VS Code settings. For example 

    {
        "sonarlint.ls.javaHome": "C:\Program Files\Java\jre1.8.0_131"
    }

## Contributions and license

SonarLint for Visual Studio Code is open source under the LGPL v3 license. Feel free to submit Pull Requests.

## Feedback

The preferred way to discuss about SonarLint is by posting on the [SonarLint Google Group](https://groups.google.com/forum/#!forum/sonarlint). Feel free to ask questions, report issues, and give suggestions on the Google Group.

Issue tracker: https://jira.sonarsource.com/browse/SLVSCODE
