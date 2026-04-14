import { Client, Account, Databases } from 'appwrite';

const client = new Client()
    .setEndpoint('https://nyc.cloud.appwrite.io/v1')
    .setProject('69db7028000e692a8364');

const account = new Account(client);
const databases = new Databases(client);

export { client, account, databases };
