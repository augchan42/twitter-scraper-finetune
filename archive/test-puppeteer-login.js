import 'dotenv/config';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

console.log('🧪 Testing Puppeteer X.com Login Flow\n');

const browser = await puppeteer.launch({
  headless: false,
  ignoreDefaultArgs: ['--enable-automation'],
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-features=IsolateOrigins,site-per-process'
  ]
});

const page = await browser.newPage();

// More realistic user agent
await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

// Set realistic viewport
await page.setViewport({ width: 1366, height: 768 });

// Additional stealth measures
await page.evaluateOnNewDocument(() => {
  // Overwrite the `languages` property to use a custom getter
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
  });

  // Overwrite the `plugins` property to use a custom getter
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
  });

  // Pass the Webdriver test
  delete navigator.__proto__.webdriver;
});

try {
  console.log('🌐 Navigating to login page...');
  await page.goto('https://x.com/i/flow/login', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });

  console.log('✓ Login page loaded\n');

  // Wait for page to be fully interactive
  await new Promise(r => setTimeout(r, 3000));

  // Log page state
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(input => ({
      type: input.type,
      name: input.name,
      autocomplete: input.autocomplete,
      visible: input.offsetParent !== null
    }));
  });

  console.log(`📋 Found ${inputs.length} total inputs (${inputs.filter(i => i.visible).length} visible):`);
  inputs.filter(i => i.visible).forEach((input, idx) => {
    console.log(`  ${idx + 1}. type="${input.type}" name="${input.name}" autocomplete="${input.autocomplete}"`);
  });

  // Enter username
  console.log('\n📝 Entering username...');
  await page.waitForSelector('input[autocomplete="username"]', { visible: true, timeout: 10000 });
  await page.click('input[autocomplete="username"]');
  await new Promise(r => setTimeout(r, 500));
  await page.type('input[autocomplete="username"]', process.env.TWITTER_USERNAME, { delay: 80 });
  await new Promise(r => setTimeout(r, 1000));

  console.log('✓ Username entered\n');

  // Click Next - using human-like mouse click
  console.log('➡️  Clicking Next button...');

  // Log all buttons on page
  const buttons = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('button, div[role="button"]')).map(btn => ({
      text: btn.textContent?.trim(),
      disabled: btn.hasAttribute('disabled'),
      ariaLabel: btn.getAttribute('aria-label')
    }));
  });
  console.log(`📋 Found ${buttons.length} buttons:`, buttons);

  // Find the Next button element and get its bounding box
  const nextButton = await page.evaluateHandle(() => {
    const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
    return buttons.find(btn => btn.textContent?.trim() === 'Next');
  });

  if (!nextButton || await nextButton.evaluate(node => !node)) {
    console.error('❌ Next button not found!');
    throw new Error('Next button not found');
  }

  // Get the button's position
  const box = await nextButton.boundingBox();
  if (!box) {
    console.error('❌ Could not get Next button position!');
    throw new Error('Could not get Next button position');
  }

  // Add small random offset to click position (more human-like)
  const x = box.x + box.width / 2 + (Math.random() - 0.5) * 10;
  const y = box.y + box.height / 2 + (Math.random() - 0.5) * 10;

  console.log(`✓ Clicking at position (${x.toFixed(0)}, ${y.toFixed(0)})`);

  // Wait for navigation with a small delay before clicking
  await new Promise(r => setTimeout(r, 500 + Math.random() * 500));

  const navigationPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => null);

  // Use mouse click instead of element.click()
  await page.mouse.click(x, y);

  console.log('✓ Next button clicked, waiting for navigation...\n');

  // Wait for either navigation or timeout
  await Promise.race([
    navigationPromise,
    new Promise(r => setTimeout(r, 5000))
  ]);

  // Check what page we're on
  const currentInputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input')).map(input => ({
      type: input.type,
      name: input.name,
      autocomplete: input.autocomplete,
      visible: input.offsetParent !== null
    }));
  });

  console.log(`📋 After Next click - found ${currentInputs.length} inputs:`);
  currentInputs.filter(i => i.visible).forEach((input, idx) => {
    console.log(`  ${idx + 1}. type="${input.type}" name="${input.name}" autocomplete="${input.autocomplete}"`);
  });

  // Determine what page we're on
  const hasPassword = currentInputs.some(i => i.type === 'password' && i.visible);
  const hasEmailVerification = currentInputs.some(i =>
    i.type === 'text' &&
    i.name === 'text' &&
    i.autocomplete !== 'username' &&
    i.visible
  );

  if (hasPassword) {
    console.log('\n✅ SUCCESS: On password page!\n');

    console.log('🔑 Entering password...');
    await page.type('input[type="password"]', process.env.TWITTER_PASSWORD, { delay: 50 });
    await new Promise(r => setTimeout(r, 1000));

    console.log('🚀 Clicking Log in...');

    const loginButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      return buttons.find(btn => btn.textContent?.trim() === 'Log in');
    });

    if (loginButton && await loginButton.evaluate(node => !!node)) {
      const loginBox = await loginButton.boundingBox();
      if (loginBox) {
        const loginX = loginBox.x + loginBox.width / 2 + (Math.random() - 0.5) * 10;
        const loginY = loginBox.y + loginBox.height / 2 + (Math.random() - 0.5) * 10;

        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
        await page.mouse.click(loginX, loginY);

        console.log('⏳ Waiting for login to complete...');
        await new Promise(r => setTimeout(r, 10000));

        const finalUrl = page.url();
        console.log(`\n✅ Login complete! Final URL: ${finalUrl}\n`);
      }
    }

  } else if (hasEmailVerification) {
    console.log('\n📧 Email verification required\n');

    console.log('📝 Entering email...');
    await page.type('input[name="text"]', process.env.TWITTER_EMAIL, { delay: 50 });
    await new Promise(r => setTimeout(r, 1000));

    console.log('➡️  Clicking Next after email...');

    const emailNextButton = await page.evaluateHandle(() => {
      const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
      return buttons.find(btn => btn.textContent?.trim() === 'Next');
    });

    if (emailNextButton && await emailNextButton.evaluate(node => !!node)) {
      const emailNextBox = await emailNextButton.boundingBox();
      if (emailNextBox) {
        const enX = emailNextBox.x + emailNextBox.width / 2 + (Math.random() - 0.5) * 10;
        const enY = emailNextBox.y + emailNextBox.height / 2 + (Math.random() - 0.5) * 10;

        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
        await page.mouse.click(enX, enY);
      }
    }

    await new Promise(r => setTimeout(r, 10000));

    console.log('🔑 Looking for password field...');
    const passwordInput = await page.$('input[type="password"]');
    if (passwordInput) {
      console.log('✓ Password field found');
      await page.type('input[type="password"]', process.env.TWITTER_PASSWORD, { delay: 50 });
      await new Promise(r => setTimeout(r, 1000));

      const emailLoginButton = await page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'));
        return buttons.find(btn => btn.textContent?.trim() === 'Log in');
      });

      if (emailLoginButton && await emailLoginButton.evaluate(node => !!node)) {
        const emailLoginBox = await emailLoginButton.boundingBox();
        if (emailLoginBox) {
          const elX = emailLoginBox.x + emailLoginBox.width / 2 + (Math.random() - 0.5) * 10;
          const elY = emailLoginBox.y + emailLoginBox.height / 2 + (Math.random() - 0.5) * 10;

          await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
          await page.mouse.click(elX, elY);
        }
      }

      await new Promise(r => setTimeout(r, 10000));
      console.log(`\n✅ Login complete! Final URL: ${page.url()}\n`);
    }
  } else {
    console.log('\n⚠️  Unexpected page state - still on username page?\n');
  }

  console.log('✅ Test complete! Browser will close in 10 seconds...');
  await new Promise(r => setTimeout(r, 10000));

} catch (error) {
  console.error('\n❌ Error:', error.message);
} finally {
  await browser.close();
}
