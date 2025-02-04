# Convergence Indexer

## About The Project

Here's the project that we use to index onChain data for Convergence protocol. The main aim is to compute and store in a database:

-   data that the Blockchain cannot compute.
-   data that tooks to much time to be retrieved fully onChain
-   historical data for BI

The Indexer is a Typescript project that:

-   Iterates indefinetly
-   Listens events on all the CVG contracts
-   Computes data based on event reception
-   Stores events & computed data in a database
-   Can be clean and restarded from the beginning ( if we want to update it )
-   Restart to the last block indexed if it's stopped

### Built With

-   [ethers.js](https://res.cloudinary.com/divzjiip8/image/upload/v1624392472/logos/ethers_blue.png)
-   [prisma](https://www.prisma.io/)
-   [typechain](https://www.npmjs.com/package/typechain?activeTab=readme)

<!-- GETTING STARTED -->

## Getting Started

### Installation

1. First install the dependencies of the project.
   Some dependencies are Github private repos, so you'll need to Authenticate.
    ```sh
    $ npm install
    ```
2. Set up your .env by replacing values in the one in example :

    - LAST_BLOCK_INDEXED => Take a block id before your CvgControlTower deployment
    - CONTRACT_CVG_CONTROL_TOWER => Address of the CvgControlTower

3. Run the indexer :

    ```sh
    $ npm run compile
    $ npm run indexer-block
    $ npm run indexer-cvgprice
    $ npm run indexer-apr
    $ npm run indexer-debank
    $ npm run indexer-airdrop
    ```

<!-- USAGE EXAMPLES -->

## Usage

-   Clean the database ( all the table), that will reset the indexing to the LAST_BLOCK_INDEXED from your .env
    ```sh
    $ npm run clean
    ```
-   LAST_BLOCK_INDEXED && CONTRACT_CVG_CONTROL_TOWER are used only at the first run of index.ts. After that first execution, they will be registered & updated in the database

## Useful Commands

Generate Prisma TypeScript types

`npx prisma generate`

Pull database to Prisma schema

`npx prisma db pull`

Create database tables from Prisma schema

`npx prisma migrate dev --name init`

## Run in cron with PM2 (PRODUCTION)

Indexer block (every 10mins)

`pm2 restart index_block --cron-restart="*/10 * * * *"`

Indexer APR (every 10mins)

`pm2 restart index_apr --cron-restart="*/10 * * * *"`

Indexer debank (every 15mins)

`pm2 restart index_debank --cron-restart="*/15 * * * *"`

Indexer price (every 1min)

`pm2 restart index_cvg_price --cron-restart="*/1 * * * *"`