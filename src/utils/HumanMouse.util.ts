import { Locator, Page } from "playwright";

export default class HumanMouse {

    private static randomBetween(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    /**
     * Mueve el mouse hasta el elemento simulando trayectoria humana
     * (pasos intermedios con desvíos aleatorios) y realiza el click.
     */
    static async click(page: Page, locator: Locator): Promise<void> {
        await locator.scrollIntoViewIfNeeded();

        const box = await locator.boundingBox();
        if (!box) {
            throw new Error('No se pudo obtener la posición del elemento para realizar el click');
        }

        // Punto aleatorio dentro del elemento (evita el centro exacto)
        const targetX = box.x + box.width / 2 + this.randomBetween(-box.width / 4, box.width / 4);
        const targetY = box.y + box.height / 2 + this.randomBetween(-box.height / 4, box.height / 4);

        // Movimiento inicial en una zona aleatoria cercana para simular origen
        const startX = Math.max(0, targetX + this.randomBetween(-200, 200));
        const startY = Math.max(0, targetY + this.randomBetween(-200, 200));
        await page.mouse.move(startX, startY, { steps: this.randomBetween(3, 6) });

        // Trayectoria en pasos con pequeños desvíos para simular el movimiento humano
        const steps = this.randomBetween(10, 20);
        let prevX = startX;
        let prevY = startY;

        for (let i = 1; i <= steps; i++) {
            const progress = i / steps;
            const jitterX = this.randomBetween(-3, 3);
            const jitterY = this.randomBetween(-3, 3);

            const nextX = prevX + (targetX - prevX) * progress * 0.4 + jitterX;
            const nextY = prevY + (targetY - prevY) * progress * 0.4 + jitterY;

            await page.mouse.move(nextX, nextY);
            await page.waitForTimeout(this.randomBetween(10, 40));

            prevX = nextX;
            prevY = nextY;
        }

        // Posición final exacta sobre el objetivo y click con pausa natural
        await page.mouse.move(targetX, targetY, { steps: this.randomBetween(2, 4) });
        await page.waitForTimeout(this.randomBetween(80, 200));
        await page.mouse.down();
        await page.waitForTimeout(this.randomBetween(50, 150));
        await page.mouse.up();
    }
}
