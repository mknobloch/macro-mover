import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('macro-mover', 'macro');

export default class Org extends SfdxCommand {

  public static description = messages.getMessage('deploy.description');

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
    macrofilename: flags.string({
      char: 'f',
      description: messages.getMessage('deploy.parameters.fileName')
    }),
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


    // Return an object to be displayed with --json
    return { };
  }
}
