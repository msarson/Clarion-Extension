import { FolderOpen, Folder, FolderOpenDot, FolderClosed } from 'lucide';

// Create SVG strings with white stroke color
const createSvgString = (iconNode: any): string => {
  const [tag, attrs, children] = iconNode;
  
  // Start with the opening tag and attributes
  let svgString = `<${tag}`;
  
  // Add all attributes
  for (const [key, value] of Object.entries(attrs)) {
    svgString += ` ${key}="${value}"`;
  }
  
  // Override the stroke color to white
  svgString += ` stroke="white"`;
  
  if (!children || children.length === 0) {
    // Self-closing tag if no children
    svgString += ' />';
  } else {
    // Close opening tag and add children
    svgString += '>';
    
    for (const child of children) {
      svgString += createSvgString(child);
    }
    
    // Add closing tag
    svgString += `</${tag}>`;
  }
  
  return svgString;
};

// Generate SVG strings with white stroke color
const folderOpenSvg = createSvgString(FolderOpen);
const folderClosedSvg = createSvgString(FolderClosed);
const folderOpenDotSvg = createSvgString(FolderOpenDot);
const folderSvg = createSvgString(Folder);

// Export the SVG strings
export const folderOpenSvgString = folderOpenSvg;
export const folderClosedSvgString = folderClosedSvg;
export const folderOpenDotSvgString = folderOpenDotSvg;
export const folderSvgString = folderSvg;

// Function to save the SVG strings to files
export function saveSvgToFiles() {
    const fs = require('fs');
    const path = require('path');
    
    // Create the images directory if it doesn't exist
    const imagesDir = path.join(__dirname, '..', '..', 'images');
    if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
    }
    
    // Save the SVG strings to files
    fs.writeFileSync(path.join(imagesDir, 'folder-open-lucide.svg'), folderOpenSvgString);
    fs.writeFileSync(path.join(imagesDir, 'folder-closed-lucide.svg'), folderClosedSvgString);
    fs.writeFileSync(path.join(imagesDir, 'folder-open-dot-lucide.svg'), folderOpenDotSvgString);
    fs.writeFileSync(path.join(imagesDir, 'folder-lucide.svg'), folderSvgString);
    
    console.log('SVG files saved to images directory');
}