import { createFreshProfileBrowser } from "../../core/BrowserFactory";

export async function run() {

    const { browser, context} = await createFreshProfileBrowser();
    

}

run()