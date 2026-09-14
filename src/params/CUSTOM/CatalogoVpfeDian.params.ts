export const TBL_QUERY_TIMEOUT = 120000
export const MAIN_URL = "https://catalogo-vpfe.dian.gov.co/User/AuthToken?pk=10910094%7C71787123&rk=890930022&token=1b02b800-951b-42fb-8314-a1fce09f1855"
export const SECONDARY_URL = "https://catalogo-vpfe.dian.gov.co/Document/Sent"
export const TBL_DATA_URL = 'https://catalogo-vpfe.dian.gov.co/Document/GetDocumentsPageToken'

export default {
    // Login
    loginBtn: "xpath=/html/body/div[3]/div[2]/div[1]/div/button[1]",
    loginTile: "xpath=/html/body/div[3]/div[2]/div[1]/span",
    // Search Form
    dateRange: "xpath=/html/body/div[3]/div/div/div[3]/div/div/div/div/div/div/div/div[1]/div/form/div/div/div/div[1]/div[1]/div[4]/div/div/input",
    documentsTypes: "xpath=/html/body/div[3]/div/div/div[3]/div/div/div/div/div/div/div/div[1]/div/form/div/div/div/div[1]/div[2]/div[1]/div/div/select",
    searchBtn: "xpath=/html/body/div[3]/div/div/div[3]/div/div/div/div/div/div/div/div[1]/div/form/div/div/div/div[2]/button",
    // Pages
    totalPages: 6092,
    currentPage: ".dt-paging-button.current",
    nextPage: "xpath=(//button[contains(@class,'dt-paging-button next')])[1]",
    lastPage: "xpath=(//button[contains(@class,'dt-paging-button last')])[1]",
    previousPage: "xpath=(//button[contains(@class,'dt-paging-button previous')])[1]",
    firstPage: "xpath=(//button[contains(@class,'dt-paging-button first')])[1]",
    // Table
    downloadBtn: "button.download-individual-payroll"
}