import { flags, SfdxCommand } from '@salesforce/command';
import { Messages, SfdxError, fs } from '@salesforce/core';
import { AnyJson } from '@salesforce/ts-types';

// Initialize Messages with the current plugin directory
Messages.importMessagesDirectory(__dirname);

// Load the specific messages for this file. Messages from @salesforce/command, @salesforce/core,
// or any library that is using the messages framework can also be loaded this way.
const messages = Messages.loadMessages('macro-mover', 'org');

export default class Org extends SfdxCommand {

  public static description = messages.getMessage('retrieveDescription');

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

    retrievefilename: flags.string({
      char: 'n',
      description: messages.getMessage('filename')
    }),

    retrievetargetdir: flags.directory({
      char: 'r',
      description: messages.getMessage('retrievetargetdir')
    }),

    targetmacros: flags.array({
      char: 'm',
      description: messages.getMessage('targetMacros')
    })
  };

  protected static supportsUsername = true;
  protected static requiresProject = false;

  public async run(): Promise<AnyJson> {
    const conn = this.org.getConnection();

    interface Macro {
      Id: string;
      Description: string;
      FolderName: string;
      IsAlohaSupported: boolean;
      IsLightingSupported: boolean;
      Name: string;
      StartingContext: string;
    }

    this.ux.log('Querying for Macros now.');
    this.ux.startSpinner;

    // Query the org
    let macroResult = await conn.query<Macro>(this.getMacroQuery(this.flags.targetmacros));
    const macroRecords = JSON.parse(JSON.stringify(macroResult.records).replace(/null/g, '""'));

    if(macroRecords.length === 0) {
      throw new SfdxError(messages.getMessage('errorNoMacrosReturned'));
    }
    
    this.ux.stopSpinner;
    this.ux.log('\n' + macroRecords.length + ' Macros retrieved.')

    interface MacroInstruction {
      MacroId: string;
      Name: string;
      Operation: boolean;
      SortOrder: boolean;
      Target: string;
      Value: string;
      ValueRecord: string;
    }

    this.ux.log('\nQuerying for MacroInstructions now.');
    this.ux.startSpinner;

    let macroInstructionResult = await conn.query<MacroInstruction>(this.getMacroInstructionQuery(macroRecords));
    const macroInstructionRecords = JSON.parse(JSON.stringify(macroInstructionResult.records).replace(/null/g, '""'));

    this.ux.log('\n' + macroInstructionRecords.length + ' MacroInstructions retrieved.');
    this.ux.stopSpinner;

    this.ux.log('\nWriting result now.');
    this.ux.startSpinner;

    macroRecords.forEach(macro => {
      macroInstructionRecords.forEach(macroInstruction => {
        if(macroInstruction.MacroId === macro.Id) {
          if(macro.MacroInstructions === undefined) {
            macro.MacroInstructions = [];
          } else {
            macro.MacroInstructions.push(macroInstruction);
          }
        }
      })
    });

    let result = {
      Macros: macroRecords
    };

    this.writeOutput(result);

    return { result };
  }

  private getMacroQuery(targetMacros) {
    let macroQuery = 'SELECT Id, Description, FolderName, IsAlohaSupported, IsLightningSupported, Name, StartingContext ' +
                     'FROM Macro ' +
                     'WHERE Name IN (';

    targetMacros.forEach(targetMacro => {
      macroQuery += '\'' + targetMacro + '\','
    });

    return macroQuery.substring(0, macroQuery.length - 1) + ')';
  }

  private getMacroInstructionQuery(macroRecords) {
    let macroInstructionQuery = 'SELECT MacroId, Name, Operation, SortOrder, Target, Value, ValueRecord ' +
                                'FROM MacroInstruction ' +
                                'WHERE MacroId IN (';

    macroRecords.forEach(macro => {
      macroInstructionQuery += '\'' + macro.Id + '\','
    });

    return macroInstructionQuery.substring(0, macroInstructionQuery.length - 1) + ')';
  }

  private async writeOutput(result) {
    let outputDestination;

    if(this.flags.retrievetargetdir) {
      if(this.flags.retrievefilename) {
        outputDestination = this.flags.retrievetargetdir + '/' + this.flags.retrievefilename + '.json';
      } else {
        outputDestination = this.flags.retrievetargetdir + '/' + this.getAutoGeneratedOutputFileName();
      }
    }

    if(this.flags.retrievetargetdir) {
      fs.readdir(this.flags.retrievetargetdir)
        .then(result => {
          this.writeJson(outputDestination, result);
        })
        .catch(error => {
          fs.mkdirp(this.flags.retrievetargetdir)
            .then(result => {
              this.writeJson(outputDestination, result);
            })
        })
    }
  }

  private getAutoGeneratedOutputFileName() {
    let today =  new Date();
    return 'macro-retrieve-' + 
            today.getMonth() + '-' + today.getDay() + '-' + today.getFullYear() + '-' +
            today.getHours() + '-' + today.getMinutes() + '-' + today.getSeconds() + '.json'
  }

  private writeJson(outputDestination, result) {
    fs.writeJson(outputDestination, result)
    .catch(error => {
      throw new SfdxError(messages.getMessage('errorWritingJson', ['./' + outputDestination]));
    });
  }
}