import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';

(async () => {
    const username = 'customer-jamesx13_UXncG';
    const password = 'Jamesrudasx13+';
    const country = 'US';
    const proxy = 'pr.oxylabs.io:7777';

    // Codifica las credenciales para manejar el '+'
    const encodedUser = encodeURIComponent(username);
    const encodedPass = encodeURIComponent(password);

    // Construye la URL con las partes ya codificadas
    const proxyUrl = `http://${encodedUser}-cc-${country}:${encodedPass}@${proxy}`;

    const agent = new HttpsProxyAgent(proxyUrl);

    const response = await fetch('https://ip.oxylabs.io/location', {
        method: 'get',
        agent: agent,
    });

    console.log(await response.text());
})();