import { createStealthBrowser } from './core/BrowserFactory';
import * as ProxyChain from 'proxy-chain';
import dotenv from 'dotenv';

dotenv.config();

(async () => {
  // Usa un proxy de prueba, reemplázalo con uno real
  const proxyUrl = process.env.PROXY_GATEWAY || 'http://user:pass@localhost:8888'; // dummy
  
  try {
    const { browser, context, anonymizedProxy } = await createStealthBrowser({
      proxyUrl,
      timezone: 'Europe/Madrid',
      locale: 'es-ES',
      geolocation: { latitude: 40.4168, longitude: -3.7038 }
    });

    const page = await context.newPage();
    await page.goto('https://bot.sannysoft.com/'); // web de prueba de detección
    await page.screenshot({ path: 'test.png', fullPage: true });
    console.log('Captura guardada. Navegador no detectado.');

    await context.close();
    await browser.close();
    await ProxyChain.closeAnonymizedProxy(anonymizedProxy, true);
  } catch (error) {
    console.error('Error:', error);
  }
})();
