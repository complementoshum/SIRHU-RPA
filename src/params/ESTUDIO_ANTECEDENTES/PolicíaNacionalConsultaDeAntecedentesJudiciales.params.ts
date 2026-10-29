export default {
    // Terminos iniciales
    acceptTerms: 'xpath=/html/body/header/div/div/div/div/div/div/form/div/div/div/div[2]/table/tbody/tr/td[1]/input',
    acceptTermsBtn: 'xpath=/html/body/header/div/div/div/div/div/div/form/div/div/div/div[2]/button',
    // Formulario de consulta
    documentInput: 'xpath=/html/body/section/form/div/div/table/tbody/tr[1]/td/table/tbody/tr[2]/td[2]/input',
    documentTypeSelect: 'xpath=/html/body/section/form/div/div/table/tbody/tr[1]/td/table/tbody/tr[1]/td[2]/select',
    searchBtn: 'xpath=/html/body/section/form/div/div/button',
    // Consulta de información
    name: 'xpath=/html/body/section/form/div/div/table/tbody/tr[2]/td/span/b[3]',
    status: 'xpath=/html/body/section/form/div/div/table/tbody/tr[2]/td/span/b[4]',
    // No results
    noResults: 'xpath=/html/body/section/form/div/div/table/tbody/tr[2]/td/span/b[2]',
}



export const STATUS_TO_VALIDATE = {
    NO_RESULTS: 'NO TIENE ASUNTOS PENDIENTES CON LAS AUTORIDADES JUDICIALES',
}