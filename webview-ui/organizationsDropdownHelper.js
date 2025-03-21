export function selectFirstOrganization(dropdown, organizations) {
    const option = document.createElement('vscode-option')
    option.setAttribute('value', organizations[0].key)
    option.innerText = organizations[0].name;
    dropdown.appendChild(option);
    option.selected = true;
    dropdown.value = organizations[0].key;
}
  
export function addNoOrgInfoMessage(dropdown) {
    const infoSpan = document.createElement('span');
    infoSpan.className = 'no-org-info-message';

    // Add info icon
    const infoIcon = document.createElement('span');
    infoIcon.innerHTML = 'ℹ️';
    infoIcon.className = 'no-org-info-icon';

    const messageSpan = document.createElement('span');
    messageSpan.innerText = 'You are not a member of any organization. Please provide the organization key manually.';
    messageSpan.style.color = 'var(--vscode-textLink-foreground)';

    infoSpan.appendChild(infoIcon);
    infoSpan.appendChild(messageSpan);
    dropdown.parentElement.appendChild(infoSpan);
}
  
export function addManualInputOption(dropdown) {
    // Add "Other..." option
    const otherOption = document.createElement('vscode-option');
    otherOption.setAttribute('value', 'organizationKeyManualInput');
    otherOption.innerText = 'Other... (provide organization key)';
    dropdown.appendChild(otherOption);
}

export function addDefaultSelection(dropdown) {
    const defaultOption = document.createElement('option');
    defaultOption.innerText = 'Select your organization...';
    defaultOption.setAttribute('value', '');
    defaultOption.selected = true;
    dropdown.appendChild(defaultOption);
}

export function populateDropdown(dropdown, organizations) {
    for (const organization of organizations) {
        const option = document.createElement('vscode-option');
        option.setAttribute('value', organization.key);
        option.selected = false;
        option.innerText = organization.name;
        dropdown.appendChild(option);
    }
}