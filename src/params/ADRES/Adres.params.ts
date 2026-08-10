export interface PersonScrapinng {
    names: string;
    lastNames: string;
    department: string;
    city: string;
    epsStatus: string;
    epsName: string;
    epsRegime: string;
    epsStartedDate: string;
    epsPersonType: string;
    screenShot: string;
} 

export interface AdresResponse {
    success: boolean;
    message: string;
    person: PersonScrapinng;
}

export default {
    // Consulta
    selectDocumentType: "#tipoDoc",
    inputDocument: "#txtNumDoc",
    btnSearch: "xpath=/html/body/div[1]/form/div[4]/input[3]",
    // Extracción de datos
    names: "xpath=/html/body/form/div[3]/div[1]/div/table/tbody/tr[4]/td[2]",
    lastNames: "xpath=/html/body/form/div[3]/div[1]/div/table/tbody/tr[5]/td[2]",
    department: "xpath=/html/body/form/div[3]/div[1]/div/table/tbody/tr[7]/td[2]",
    city: "xpath=/html/body/form/div[3]/div[1]/div/table/tbody/tr[8]/td[2]",
    epsStatus: "xpath=/html/body/form/div[3]/div[2]/table/tbody/tr[2]/td[1]",
    epsName: "xpath=/html/body/form/div[3]/div[2]/table/tbody/tr[2]/td[2]",
    epsRegime: "xpath=/html/body/form/div[3]/div[2]/table/tbody/tr[2]/td[3]",
    epsStartedDate: "xpath=/html/body/form/div[3]/div[2]/table/tbody/tr[2]/td[4]",
    epsPersonType: "xpath=/html/body/form/div[3]/div[2]/table/tbody/tr[2]/td[6]",
    // Errores
    errorNoResults: "xpath=//*[@id='lblError']"
}