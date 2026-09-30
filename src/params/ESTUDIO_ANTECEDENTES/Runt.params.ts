export default {
    // :: CONSULTA ::
    documentType: 'tipoDocumento',
    documentNumber: 'xpath=/html/body/host-runt-root/app-layout/app-theme-runt2/mat-sidenav-container/mat-sidenav-content/div/ng-component/div/div[2]/div[2]/mat-card/mat-card-content/form/div[1]/div[2]/mat-form-field/div/div[1]/div[3]/input',
    firtsLastName: 'xpath=/html/body/host-runt-root/app-layout/app-theme-runt2/mat-sidenav-container/mat-sidenav-content/div/ng-component/div/div[2]/div[2]/mat-card/mat-card-content/form/div[1]/div[3]/mat-form-field/div/div[1]/div[3]/input',
    captchaImage: 'xpath=/html/body/host-runt-root/app-layout/app-theme-runt2/mat-sidenav-container/mat-sidenav-content/div/ng-component/div/div[2]/div[2]/mat-card/mat-card-content/form/div[2]/img',
    captchaCodeInput: 'xpath=/html/body/host-runt-root/app-layout/app-theme-runt2/mat-sidenav-container/mat-sidenav-content/div/ng-component/div/div[2]/div[2]/mat-card/mat-card-content/form/div[2]/mat-form-field/div/div[1]/div[3]/input',
    submitButton: 'form button[type="submit"]',
    captchaError: 'xpath=/html/body/div[4]/div/div[2]',
    captchaErrorDismiss: 'xpath=/html/body/div[4]/div/div[6]/button[1]',
    noLicenseMessage: 'text=No se ha encontrado la persona en estado ACTIVA o SIN REGISTRO',
    // :: EXTRAER INFORMACIÓN DE LICENCIA(S) ::
    licensesExpanded: 'xpath=/html/body/host-runt-root/app-layout/app-theme-runt2/mat-sidenav-container/mat-sidenav-content/div/ng-component/div/div[2]/div/div/mat-accordion/mat-expansion-panel[1]/mat-expansion-panel-header',
    licensesTable: 'cyrpublico-mr-licencias-conduccion table.mat-table',
    licenseDetailDialog: 'mat-dialog-container:has(cyrpublico-mr-detalle-categorias)',
    licenseDetailTable: 'mat-dialog-container cyrpublico-mr-detalle-categorias table.mat-table'
}

export const MAPEO_TIPO_DOCUMENTO_PERSONA: Record<string, string> = {
  'C': 'Cédula Ciudadanía',
  'CD': 'Carnet Diplomático',
  'E': 'Cédula de Extranjería',
  'P': 'Pasaporte',
  'T': 'Tarjeta de Identidad',
  'RC': 'Registro Civil',
  'PT': 'Permiso por Protección Temporal',
};