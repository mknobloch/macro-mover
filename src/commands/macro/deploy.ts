import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('macro-mover', 'org');

export default class Org extends SfdxCommand {

  public static description = messages.getMessage('commandDescription');

  public static examples = [
  `$ sfdx hello:org --targetusername myOrg@example.com --targetdevhubusername devhub@org.com
  Hello world! This is org: MyOrg and I will be around until Tue Mar 20 2018!
  My hub org id is: 00Dxx000000001234
  `,
  `$ sfdx hello:org --name myname --targetusername myOrg@example.com
  Hello myname! This is org: MyOrg and I will be around until Tue Mar 20 2018!
  `
  ];

  public static args = [{name: 'file'}];

  protected static flagsConfig = {
    // flag with a value (-n, --name=VALUE)
    macrodevelopername: flags.string({
      char: 'n',
      description: messages.getMessage('macroDeveloperName')
    }),

    retrievetargetdir: flags.directory({
      char: 'r',
      description: messages.getMessage('retrievetargetdir')
    }),

    retrievetype: flags.enum({
      char: 't',
      description: messages.getMessage('retrieveType'),
      options: ['all, list']
    }),

    targetmacros: flags.array({
      char: 'm',
      description: messages.getMessage('targetMacros')
    })
  };

  protected static supportsUsername = true;
  protected static requiresProject = false;

  public async run(): Promise<AnyJson> {

    //params
    const name = this.flags.name || 'world';

    //config defaults:
    this.ux.log(JSON.stringify(this.configAggregator.getPropertyValue('defaultusername')));

    // this.org is guaranteed because requiresUsername=true, as opposed to supportsUsername
    const conn = this.org.getConnection();
    const macroQuery = 'Select Description, FolderName, IsAlohaSupported, IsLightningSupported, ' +
                              'Name, StartingContext from Macro';

    // The type we are querying for
    interface Macro {
      Description: string;
      FolderName: string;
      IsAlohaSupported: boolean;
      IsLightingSupported: boolean;
      Name: string;
      StartingContext: string;
    }

    // Query the org
    let result = await conn.query<Macro>(macroQuery);
    const macroRecords = JSON.parse(JSON.stringify(result.records).replace(/null/g, '""'))
    this.ux.logJson(macroRecords);

    let folderNamesSet = new Set([]);
    macroRecords.forEach(function(record){
      if(record.FolderName !== ''){
        folderNamesSet.add(record.FolderName);
      }
    });

    // The type we are querying for
    interface Folder {
      Id: string;
      FolderName: string;
      DeveloperName: string;
      AccessType: string;
    }

    let targetFolderResult = await conn.query<Folder>(this.getTargetOrgFolderQueryString(folderNamesSet));
    const folderRecords = targetFolderResult.records;
    this.ux.logJson(folderRecords);

    // ----------------------------------------

    // Organization will always return one result, but this is an example of throwing an error
    // The output and --json will automatically be handled for you.
    if (!result.records || result.records.length <= 0) {
      throw new SfdxError(messages.getMessage('errorNoOrgResults', [this.org.getOrgId()]));
    }

    // Organization always only returns one result
    const macroDescription = result.records[0].Description;

    let outputString = `Hello I pulled one macro with description: ${macroDescription}!`;
    this.ux.log(outputString);

    // this.hubOrg is NOT guaranteed because supportsHubOrgUsername=true, as opposed to requiresHubOrgUsername.
    if (this.hubOrg) {
      const hubOrgId = this.hubOrg.getOrgId();
      this.ux.log(`My hub org id is: ${hubOrgId}`);
    }

    if (this.flags.force && this.args.file) {
      this.ux.log(`You input --force and a file: ${this.args.file}`);
    }

    // Return an object to be displayed with --json
    return { orgId: this.org.getOrgId(), outputString };
  }

  private getTargetOrgFolderQueryString(folderNamesSet) {
    let folderQuery = 'Select Id, Name, DeveloperName, AccessType From Folder Where Name IN (';

    folderNamesSet.forEach(function(folderName) {
      folderQuery += '\'' + folderName + '\',';
    })

    return folderQuery.substring(0, folderQuery.length - 1) + ')';
  }
}
