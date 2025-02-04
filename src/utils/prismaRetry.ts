import { Prisma } from '@prisma/client';

const MAX_RETRIES = 3;

export async function prismaRetry<T>(prismaPromise: Prisma.PrismaPromise<T>) {
    let tentativeNumber = 1;
    let error: any;

    while (tentativeNumber < MAX_RETRIES) {
        try {
            return await prismaPromise;
        } catch (e: any) {
            // TODO: sentry exception
            if (e instanceof Prisma.PrismaClientKnownRequestError) {
                console.error(e.code, e.message);
            } else {
                console.error(e.toString());
            }

            tentativeNumber++;
            error = e;
        }
    }

    throw error;
}
