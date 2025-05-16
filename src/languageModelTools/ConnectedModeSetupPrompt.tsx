/* --------------------------------------------------------------------------------------------
 * SonarLint for VisualStudio Code
 * Copyright (C) 2017-2025 SonarSource SA
 * sonarlint@sonarsource.com
 * Licensed under the LGPLv3 License. See LICENSE.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

'use strict';

import {
	BasePromptElementProps,
	PromptElement,
	PromptSizing,
	SystemMessage,
} from '@vscode/prompt-tsx';

export interface PromptProps extends BasePromptElementProps {
	userQuery: string;
}

export class ConnectedModeSetupPrompt extends PromptElement<PromptProps, void> {
	render(_state: void, _sizing: PromptSizing) {
		return (
			<>
				<SystemMessage>
					In order to set up Connected Mode for the workspace folder, first you need to know
                    whether to connect to SonarQube Server (on-premise) or SonarCloud (cloud).
                    If connecting to SonarQube Server, you also need to know the URL of the server.
                    You need to get this infomation from the user.
				</SystemMessage>
			</>
		);
	}
}