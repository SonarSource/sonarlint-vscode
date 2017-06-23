# SonarLint for Visual Studio Code

SonarLint is a Visual Studio Code extension that provides on-the-fly feedback to developers on new bugs and quality issues injected into JavaScript, PHP and Python code.

## How it works

Simply open a JS, PHP or Python file, start coding, and you will start seeing issues reported by SonarLint. Issues are highlighted in your code, and also listed in the 'Problems' panel.

![sonarlint on-the-fly](images/sonarlint-vscode.gif)

You can access the detailed issue description directly from your editor, using the provided contextual menu.

You will benefit from the following code analyzers: [SonarJS](https://redirect.sonarsource.com/plugins/javascript.html), [SonarPHP](https://redirect.sonarsource.com/plugins/php.html) and [SonarPython](https://redirect.sonarsource.com/plugins/python.html). You can find all available rules descriptions on the dedicated [SonarLint website](http://www.sonarlint.org/vscode/rules/index.html).

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
