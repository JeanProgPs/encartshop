import postcss from 'postcss';
import tailwindcss from '@tailwindcss/postcss';
import fs from 'fs';

const inputPath = './assets/input.css';
const outputPath = './assets/output.css';

fs.readFile(inputPath, 'utf-8', (err, css) => {
  if (err) {
    console.error('Error reading input file:', err);
    process.exit(1);
  }

  postcss([tailwindcss])
    .process(css, { from: inputPath, to: outputPath })
    .then(result => {
      fs.writeFileSync(outputPath, result.css);
      if (result.map) {
        fs.writeFileSync(outputPath + '.map', result.map);
      }
      console.log('✓ Tailwind CSS compiled successfully to', outputPath);
    })
    .catch(err => {
      console.error('Error compiling Tailwind CSS:', err);
      process.exit(1);
    });
});
