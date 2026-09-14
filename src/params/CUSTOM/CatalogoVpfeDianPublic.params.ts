export default {
    // StartPoint
    // Data
    complementosNit: "890930022",
    // Download path (Windows: "J:/TI/Caso UGPP/RPA DIAN" | Linux: "/mnt/ti/caso_ugpp/rpa_dian")
    downloadPath: "J:/TI/Caso UGPP/RPA DIAN",
    // Frm
    mainPage: 'https://catalogo-vpfe.dian.gov.co/User/SearchDocument',
    cufeCode: "xpath=//*[@id='DocumentKey']",
    nitCode: "xpath=//*[@id='SearchDocumentNit']",
    btnSearch: "xpath=/html/body/div[3]/div[2]/div/form/button",
    // Download
    btnDownload: "xpath=/html/body/div[1]/div/div/div[3]/div/div/div[2]/div/div[1]/div[4]/div/div[1]/div[3]/form/a",
    btnConfirmAlert: "xpath=/html/body/div[3]/div/div/div[3]/button",
}

export interface RegisterDian {
    id: number;
    nit: string;
    estado: string;
    url_soporte: string;
    ['CUFE/CUDE']: string;
    fechas_ultima_ejecucion: string;
}
