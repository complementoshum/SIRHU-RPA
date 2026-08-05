import dotenv from 'dotenv';
dotenv.config();

interface WebshareProxy {
  id: string;
  proxy_address: string;
  port: number;
  username: string;
  password: string;
  country_code: string;
  valid: boolean;
}

export class ProxyManager {
  private apiKey: string;
  private proxyType: string;

  constructor() {
    this.apiKey = process.env.WEBSHARE_API_KEY || '';
    this.proxyType = process.env.WEBSHARE_PROXY_TYPE || 'residential';

    if (!this.apiKey) {
      throw new Error(
        'Falta WEBSHARE_API_KEY en el archivo .env. Coloca tu API key de Webshare.'
      );
    }
  }

  /**
   * Obtiene un proxy fresco desde la API de Webshare.
   * Para forzar rotación siempre, podemos solicitar uno nuevo cada vez.
   */
  async fetchProxy(): Promise<WebshareProxy> {
    // Endpoint de la API para listar proxies según tipo
    const url =
      this.proxyType === 'datacenter'
        ? 'https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=25'
        : 'https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&type=residential&page=1&page_size=25';

    const response = await fetch(url, {
      headers: {
        Authorization: `Token ${this.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Error al obtener proxies: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const proxies: WebshareProxy[] = data.results;

    if (!proxies || proxies.length === 0) {
      throw new Error('No se encontraron proxies disponibles en la cuenta.');
    }

    // Devolver uno al azar para rotación
    const randomProxy = proxies[Math.floor(Math.random() * proxies.length)];
    return randomProxy;
  }

  /**
   * Construye la URL completa del proxy (compatible con proxy-chain)
   * a partir de los datos devueltos por la API.
   */
  async getProxyUrl(): Promise<string> {
    const proxy = await this.fetchProxy();
    return `http://${proxy.username}:${proxy.password}@${proxy.proxy_address}:${proxy.port}`;
  }
}