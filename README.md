# SonarLint for Visual Studio Code

On-the-fly analysis of your code to report potential bugs, vulnerabilities and code smells.

## Features

Open a file of a supported language, code, and you should start seeing problems reported by SonarLint.

![sonarlint on-the-fly](images/sonarlint-vscode.gif)

Included analyzers: [SonarJS](https://redirect.sonarsource.com/plugins/javascript.html), [SonarPHP](https://redirect.sonarsource.com/plugins/php.html) and [SonarPython](https://redirect.sonarsource.com/plugins/python.html)

## Requirements

You need a Java Runtime (JRE) 8 installed on your computer. SonarLint will find it using various methods but you can also explicitely 
set the path where it is installed using the 'sonarlint.ls.javaHome' variable in VS Code settings.
