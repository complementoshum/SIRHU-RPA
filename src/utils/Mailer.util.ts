import nodemailer, { Transporter } from 'nodemailer';
import * as fs from 'fs';
import * as path from 'path';

interface MailConfig {
    host: string;
    port: number;
    secure: boolean;
    auth: {
        user: string;
        pass: string;
    };
}

interface SendMailOptions {
    to: string | string[];
    subject: string;
    template: string;
    data?: Record<string, string>;
    cc?: string | string[];
    bcc?: string | string[];
    attachments?: Array<{
        filename: string;
        path: string;
        cid?: string;
    }>;
}

class Mailer {
    private transporter: Transporter;
    private fromAddress: string;
    private templatesBasePath: string;
    private assetsBasePath: string;

    constructor() {
        const config: MailConfig = {
            host: process.env.SMTP_HOST || '',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER || '',
                pass: process.env.SMTP_PASS || ''
            }
        };

        this.fromAddress = process.env.SMTP_FROM || config.auth.user;
        this.templatesBasePath = path.join(__dirname, '..', 'template', 'emails');
        this.assetsBasePath = path.join(__dirname, '..', 'template', 'assets');

        this.transporter = nodemailer.createTransport(config);
    }

    /**
     * Renderiza un template HTML reemplazando las variables con los datos proporcionados
     * @param templatePath - Ruta relativa del template desde la carpeta de templates
     * @param data - Objeto con las variables a reemplazar en el template
     * @returns HTML renderizado
     */
    private renderTemplate(templatePath: string, data: Record<string, string> = {}): string {
        const fullPath = path.join(this.templatesBasePath, templatePath);

        if (!fs.existsSync(fullPath)) {
            throw new Error(`Template not found: ${fullPath}`);
        }

        let html = fs.readFileSync(fullPath, 'utf-8');

        // Reemplaza variables en formato {{variable}}
        for (const [key, value] of Object.entries(data)) {
            const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
            html = html.replace(regex, value);
        }

        return html;
    }

    /**
     * Formatea los destinatarios a un string separado por comas
     */
    private formatRecipients(recipients: string | string[]): string {
        return Array.isArray(recipients) ? recipients.join(', ') : recipients;
    }

    /**
     * Envía un correo electrónico
     * @param options - Opciones del correo
     */
    async send(options: SendMailOptions): Promise<{ success: boolean; messageId?: string; error?: string }> {
        try {
            const html = this.renderTemplate(options.template, options.data);

            // Extraer imágenes embebidas del HTML (formato cid:nombre)
            const embeddedImages = this.extractEmbeddedImages(html);

            const mailOptions = {
                from: this.fromAddress,
                to: this.formatRecipients(options.to),
                subject: options.subject,
                html,
                ...(options.cc && { cc: this.formatRecipients(options.cc) }),
                ...(options.bcc && { bcc: this.formatRecipients(options.bcc) }),
                attachments: [
                    ...embeddedImages,
                    ...(options.attachments || [])
                ]
            };

            const info = await this.transporter.sendMail(mailOptions);

            return {
                success: true,
                messageId: info.messageId
            };
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error('[Mailer] Error sending email:', errorMessage);
            return {
                success: false,
                error: errorMessage
            };
        }
    }

    /**
     * Extrae imágenes embebidas del HTML y las prepara como adjuntos CID
     */
    private extractEmbeddedImages(html: string): Array<{ filename: string; path: string; cid: string }> {
        const cidRegex = /cid:([\w\-\.]+)/g;
        const images: Array<{ filename: string; path: string; cid: string }> = [];
        const foundCids = new Set<string>();

        let match;
        while ((match = cidRegex.exec(html)) !== null) {
            const cid = match[1];
            if (!foundCids.has(cid)) {
                foundCids.add(cid);
                const imagePath = path.join(this.assetsBasePath, 'img', cid);
                if (fs.existsSync(imagePath)) {
                    images.push({
                        filename: cid,
                        path: imagePath,
                        cid: cid
                    });
                }
            }
        }

        return images;
    }

    /**
     * Verifica la conexión con el servidor SMTP
     */
    async verifyConnection(): Promise<boolean> {
        try {
            await this.transporter.verify();
            console.log('[Mailer] SMTP connection verified successfully');
            return true;
        } catch (error) {
            console.error('[Mailer] SMTP connection failed:', error);
            return false;
        }
    }
}

export default Mailer;