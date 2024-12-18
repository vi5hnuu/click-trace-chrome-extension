let hierarchyElements = [];


function clearItems(){
    document.querySelectorAll('.click-trace-line, .click-trace-tooltip, .click-trace-list').forEach(el => el.remove());
}

function  clearTrace(){
    document.querySelectorAll('.click-trace-line, .click-trace-tooltip').forEach(el => el.remove());
}
// Function to draw lines relative to the selected element
function drawLines(event, selectedElement = null) {
    const pointerX = event.clientX;
    const pointerY = event.clientY;

    // Remove existing lines and tooltips
    clearItems();

    // Get the target element of the initial click
    const targetElement = selectedElement || event.target;
    let element = event.target;

    // Create an array to store the hierarchy
    hierarchyElements = [];

    while (element) {
        hierarchyElements.push(element);
        element = element.parentElement;
    }

    // Draw the hierarchy list on the screen
    drawHierarchyList(pointerX, pointerY);

    // Draw lines for the selected element
    drawElementLines(targetElement, pointerX, pointerY);
}

// Function to draw lines for a specific element
function drawElementLines(element, pointerX, pointerY) {
    clearTrace();    // Get the bounding rectangle of the current element
    const rect = element.getBoundingClientRect();

    // Calculate the relative click position
    const relativeX = pointerX - rect.left;
    const relativeY = pointerY - rect.top;

    // Draw vertical line relative to the current element
    const verticalLine = document.createElement('div');
    verticalLine.className = 'click-trace-line';
    verticalLine.style.position = 'fixed';
    verticalLine.style.left = `${rect.left + relativeX}px`;
    verticalLine.style.top = `${rect.top}px`;
    verticalLine.style.height = `${rect.height}px`;
    verticalLine.style.width = '1px';
    verticalLine.style.backgroundColor = 'red';
    verticalLine.style.zIndex = '9999';
    document.body.appendChild(verticalLine);

    // Draw horizontal line relative to the current element
    const horizontalLine = document.createElement('div');
    horizontalLine.className = 'click-trace-line';
    horizontalLine.style.position = 'fixed';
    horizontalLine.style.left = `${rect.left}px`;
    horizontalLine.style.top = `${rect.top + relativeY}px`;
    horizontalLine.style.width = `${rect.width}px`;
    horizontalLine.style.height = '1px';
    horizontalLine.style.backgroundColor = 'red';
    horizontalLine.style.zIndex = '9999';
    document.body.appendChild(horizontalLine);

    // Add a tooltip showing the relative position for the current element
    const tooltip = document.createElement('div');
    tooltip.className = 'click-trace-tooltip';
    tooltip.textContent = JSON.stringify({
        element:element.tagName.toLowerCase(),
        x: relativeX.toFixed(2),
        y: relativeY.toFixed(2),
        pointerClientX:pointerX.toFixed(2),
        pointerClientY: pointerY.toFixed(2)
    });
    tooltip.style.position = 'fixed';
    tooltip.style.maxWidth = '200px'; // Set max width
    tooltip.style.wordWrap = 'break-word'; // Allow text to break to the next line
    tooltip.style.padding = '4px 6px';
    tooltip.style.backgroundColor = 'yellow';
    tooltip.style.color = '#000';
    tooltip.style.fontSize = '12px';
    tooltip.style.border = '1px solid #000';
    tooltip.style.zIndex = '10000';
    tooltip.style.whiteSpace = 'normal'; // Allow normal line wrapping

// Ensure the tooltip stays within the viewport
    let tooltipLeft = pointerX + 10;
    let tooltipTop = pointerY + 10;

// Check if tooltip goes off the right edge of the viewport
    if (tooltipLeft + 200 > window.innerWidth) {
        tooltipLeft = window.innerWidth - 210; // Adjust to keep within viewport
    }

// Check if tooltip goes off the bottom edge of the viewport
    if (tooltipTop + tooltip.offsetHeight > window.innerHeight) {
        tooltipTop = window.innerHeight - tooltip.offsetHeight - 10; // Adjust to keep within viewport
    }

    tooltip.style.left = `${tooltipLeft}px`;
    tooltip.style.top = `${tooltipTop}px`;

    document.body.appendChild(tooltip);
}

// Function to draw the hierarchy list
function drawHierarchyList(pointerX, pointerY) {
    const listContainer = document.createElement('div');
    listContainer.className = 'click-trace-list';
    listContainer.style.position = 'fixed';
    listContainer.style.backgroundColor = '#fff';
    listContainer.style.border = '0.5px solid #000';
    listContainer.style.borderRadius = '10px';
    listContainer.style.padding = '5px';
    listContainer.style.zIndex = '10000';
    listContainer.style.maxHeight = '250px';
    listContainer.style.overflowY = 'auto';

    // Ensure the tooltip stays within the viewport
    let listContainerLeft = pointerX + 10;
    let listContainerTop = pointerY + 10;

    // Check if tooltip goes off the right edge of the viewport
    if (listContainerLeft + 200 > window.innerWidth) {
        listContainerLeft = window.innerWidth - 210; // Adjust to keep within viewport
    }

// Check if tooltip goes off the bottom edge of the viewport
    if (listContainerTop + listContainer.offsetHeight > window.innerHeight) {
        listContainerTop = window.innerHeight - listContainer.offsetHeight - 10; // Adjust to keep within viewport
    }

    listContainer.style.left = `${listContainerLeft}px`;
    listContainer.style.top = `${listContainerTop}px`;

    hierarchyElements.forEach((el, index) => {
        const item = document.createElement('div');
        item.textContent = `${el.tagName} ${el.name ?? ''} {${el.id ?? ''}}`;
        item.style.padding = '2px 4px';
        item.style.cursor = 'pointer';
        item.style.borderBottom = '1px solid #fff';

        item.addEventListener('click', (e) => {
            e.stopPropagation();
            drawElementLines(el, pointerX, pointerY);
        });

        listContainer.appendChild(item);
    });

    document.body.appendChild(listContainer);
}

// Add event listener for clicks
document.addEventListener('click', drawLines);
