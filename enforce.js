const fs = require("fs");
const ignoreFiles = ['login.html', 'signup.html', 'index.html', 'setup.html', 'forgot-password.html', 'splash.html', 'subscription.html', 'verify-email.html', 'enforce.js'];
const files = fs.readdirSync(".").filter(f => f.endsWith(".html") && !ignoreFiles.includes(f));

files.forEach(f => {
  let txt = fs.readFileSync(f, "utf8");
  
  if (f.startsWith('customer-')) {
    // This is a CUSTOMER page. It must REJECT owners.
    if(txt.includes('if(parsed.role === \'owner\')')) return; // already done
    
    // Find the spot after parsed is declared
    txt = txt.replace(
      'const parsed = JSON.parse(localU);',
      `const parsed = JSON.parse(localU);\n            if(parsed.role === 'owner') { location.href = 'dashboard.html'; return; }`
    );
    fs.writeFileSync(f, txt);
    console.log("Patched Customer Page: " + f);
  } else {
    // This is a SHOPKEEPER page. It must REJECT customers.
    if(txt.includes('if(parsed.role === \'customer\')')) return; // already done
    
    // Find the spot after parsed is declared
    if(txt.includes('const parsed = JSON.parse(localU);')) {
       txt = txt.replace(
         'const parsed = JSON.parse(localU);',
         `const parsed = JSON.parse(localU);\n            if(parsed.role === 'customer') { location.href = 'customer-dashboard.html'; return; }`
       );
       fs.writeFileSync(f, txt);
       console.log("Patched Shopkeeper Page: " + f);
    } else {
       // Some shopkeeper pages might not have parsed logic.
       // E.g., pos.html uses a custom function or old parsing.
       console.log("Could not auto-patch (check manually): " + f);
    }
  }
});
