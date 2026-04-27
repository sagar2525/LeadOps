const fs = require('fs');

const files = [
  'New Leads - Reporting.blueprint (1).json',
  'Daily Summary Project Stats - Reporting.blueprint.json'
];

files.forEach(f => {
  try {
    const data = JSON.parse(fs.readFileSync('docs/make-blueprints/' + f));
    console.log(`\n\n--- File: ${f} ---`);
    if(data.blueprint && data.blueprint.modules) {
        data.blueprint.modules.forEach(m => {
            console.log(`Module ID: ${m.id}, Name: ${m.name}`);
            if (m.filter) {
                console.log(`Filter: ${m.filter.name}`);
            }
        });
    }
  } catch(e) {
    console.log('Error reading ' + f + ': ' + e.message);
  }
});
