# SonarQube for IDE: Views

This folder contains the source for the Web views of SonarQube for IDE based on [nano-react-app](https://github.com/nano-react-app/nano-react-app).

- `npm run build` — This will output a production build in the `dist` directory.
- `npm run typecheck` — This will run `tsc --noEmit` which basically just typechecks your project.

## Adding styles

You can use CSS files with simple ES2015 `import` statements anywhere in your Javascript:

```js
import "./index.css";
```
