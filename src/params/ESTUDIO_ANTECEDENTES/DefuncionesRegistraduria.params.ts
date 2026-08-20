export interface DefuncionesRegistraduriaResponse {
    success: boolean;
    isDead: boolean;
    screenshot?: string;
}

export default {
    documentNumber: 'xpath=//*[@id="nuip"]',
    searchButton: 'xpath=/html/body/app-root/section/div/div/div/div/div[2]/form/div/button',
    result: 'xpath=/html/body/app-root/section/div[2]/div/div/div/div/p/span[2]/strong',
    noExists: 'xpath=/html/body/app-root/section/div[2]/div/div/div/div/p'
}