import { google } from "googleapis";

export async function readJsonFile<T>(fileId: string): Promise<T> {
    const gDriveClient = clientGDrive()

    const res = await gDriveClient.files.export({ fileId, mimeType: "text/plain" }, { responseType: "stream" })

    const text = await new Promise((resolve, reject) => {
        let data = ""
        res.data.on("data", (chunk) => (data += chunk))
        res.data.on("end", () => resolve(data))
        res.data.on("error", reject)
    })

    const clean = (text as string).replace(/^\uFEFF/, "").trim()
    return JSON.parse(clean) as T
}


function clientGDrive() {
    const auth = new google.auth.GoogleAuth({ scopes: ["https://www.googleapis.com/auth/drive"] })
    try {
        const drive = google.drive({ version: "v3", auth })
        return drive
    } catch (err) {
        console.log("loulouuu")
        throw err
    }
}

export type AddressesJson = {
    utilities: {
        controlTower: string;
        rewardAccumulator: string;
        zappingProxy: string;
        marketCreator: string;
        irCalculator: string;
        pegKeeperRegulator: string;
    },
    tokens: {
        USG: string;
        sUSG: string;
        TAN: string;
        sTAN: string;
        vsTAN: string
    },
    implementation: {
        convexCrvMarket: string;
        convexFxnMarket: string;
        basicERC20Market: string;
    },
    oracles: { [tokenName: string]: string };
    pegKeepers: { [poolName: string]: string };
    markets: { marketAddress: string; collatName: string; collatAddress: string; marketType: string }[]
}