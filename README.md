# SonarLint for Visual Studio Code

[![Build Status](https://travis-ci.org/SonarSource/sonarlint-vscode.svg?branch=master)](https://travis-ci.org/SonarSource/sonarlint-vscode)

Do static analysis of your code on the fly and report potential bugs, vulnerabilities and code smells.

## Features

Supported languages: JavaScript, PHP and Python

## Requirements

You need Java Runtime (JRE) 8 installed on your computer. SonarLint will find it using various methods but you can also explicitely 
set the path where it is installed using the \'sonarlint.ls.javaHome\' variable in VS Code settings.

## How to build
```
npm install
npm install --global gulp-cli #if you don't have gulp
gulp package
```
