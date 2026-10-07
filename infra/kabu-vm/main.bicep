@description('VM name')
param vmName string = 'vm-kabu-aqua'

@description('Admin username')
param adminUsername string = 'aquaadmin'

@secure()
@description('Admin password — never commit')
param adminPassword string

@description('Japan East for Cosmos alignment')
param location string = 'japaneast'

@description('B2s = 2 vCPU / 4GiB — minimum practical for kabu GUI')
param vmSize string = 'Standard_B2s'

@description('CIDR allowed to RDP. Empty = no inbound RDP rule (use JIT later). Example: 203.0.113.10/32')
param rdpAllowedCidr string = ''

@description('Auto-shutdown local time HHmm (JST market close buffer)')
param autoShutdownTime string = '1600'

@description('Windows timezone id for auto-shutdown')
param autoShutdownTimezone string = 'Tokyo Standard Time'

@description('OS disk GiB. Azure cannot shrink existing disks; this applies on create.')
param osDiskSizeGb int = 64

@description('OS disk SKU. Standard_LRS (HDD) is cheaper while stopped; SSD only if GUI I/O needs it.')
@allowed([
  'Standard_LRS'
  'StandardSSD_LRS'
])
param osDiskSku string = 'Standard_LRS'

@description('Attach a public IP. Default false — Tailscale/private access only (cost).')
param createPublicIp bool = false

@description('Cost / ownership tags')
param tags object = {
  app: 'aqua-kabu'
  purpose: 'kabu-station-host'
  costCenter: 'personal-apps'
  schedule: 'market-hours-jst'
}

var vnetName = '${vmName}-vnet'
var nsgName = '${vmName}-nsg'
var nicName = '${vmName}-nic'
var pipName = '${vmName}-pip'
var subnetName = 'subnet-kabu'
var osDiskName = '${vmName}-osdisk'

resource vnet 'Microsoft.Network/virtualNetworks@2023-09-01' = {
  name: vnetName
  location: location
  tags: tags
  properties: {
    addressSpace: {
      addressPrefixes: [
        '10.60.0.0/16'
      ]
    }
    subnets: [
      {
        name: subnetName
        properties: {
          addressPrefix: '10.60.1.0/24'
          networkSecurityGroup: {
            id: nsg.id
          }
        }
      }
    ]
  }
}

resource nsg 'Microsoft.Network/networkSecurityGroups@2023-09-01' = {
  name: nsgName
  location: location
  tags: tags
  properties: {
    securityRules: concat(
      [
        {
          name: 'Deny-KabuApi-Internet'
          properties: {
            priority: 100
            direction: 'Inbound'
            access: 'Deny'
            protocol: 'Tcp'
            sourceAddressPrefix: 'Internet'
            sourcePortRange: '*'
            destinationAddressPrefix: '*'
            destinationPortRanges: [
              '18080'
              '18081'
            ]
            description: 'Never expose kabuステーション API to Internet'
          }
        }
        {
          // Explicit deny even before default DenyAll — belt for misconfigured allow rules
          name: 'Deny-RDP-Internet'
          properties: {
            priority: 110
            direction: 'Inbound'
            access: 'Deny'
            protocol: 'Tcp'
            sourceAddressPrefix: 'Internet'
            sourcePortRange: '*'
            destinationAddressPrefix: '*'
            destinationPortRange: '3389'
            description: 'Block RDP from Internet; trusted CIDR allow (if any) is higher priority'
          }
        }
      ],
      empty(rdpAllowedCidr)
        ? []
        : [
            {
              name: 'Allow-RDP-FromTrustedIp'
              properties: {
                // Must be lower number than Deny-RDP-Internet so /32 wins
                priority: 105
                direction: 'Inbound'
                access: 'Allow'
                protocol: 'Tcp'
                sourceAddressPrefix: rdpAllowedCidr
                sourcePortRange: '*'
                destinationAddressPrefix: '*'
                destinationPortRange: '3389'
                description: 'RDP only from Mickey trusted CIDR'
              }
            }
          ]
    )
  }
}

resource pip 'Microsoft.Network/publicIPAddresses@2023-09-01' = if (createPublicIp) {
  name: pipName
  location: location
  tags: tags
  sku: {
    name: 'Standard'
  }
  properties: {
    publicIPAllocationMethod: 'Static'
  }
}

resource nic 'Microsoft.Network/networkInterfaces@2023-09-01' = {
  name: nicName
  location: location
  tags: tags
  properties: {
    ipConfigurations: [
      {
        name: 'ipconfig1'
        properties: union(
          {
            subnet: {
              id: vnet.properties.subnets[0].id
            }
            privateIPAllocationMethod: 'Dynamic'
          },
          createPublicIp
            ? {
                publicIPAddress: {
                  id: pip!.id
                }
              }
            : {}
        )
      }
    ]
    networkSecurityGroup: {
      id: nsg.id
    }
  }
}

resource vm 'Microsoft.Compute/virtualMachines@2023-09-01' = {
  name: vmName
  location: location
  tags: tags
  properties: {
    hardwareProfile: {
      vmSize: vmSize
    }
    osProfile: {
      computerName: take(vmName, 15)
      adminUsername: adminUsername
      adminPassword: adminPassword
      windowsConfiguration: {
        enableAutomaticUpdates: true
        provisionVMAgent: true
      }
    }
    storageProfile: {
      imageReference: {
        publisher: 'MicrosoftWindowsServer'
        offer: 'WindowsServer'
        sku: '2022-datacenter-azure-edition-smalldisk'
        version: 'latest'
      }
      osDisk: {
        name: osDiskName
        createOption: 'FromImage'
        managedDisk: {
          storageAccountType: osDiskSku
        }
        diskSizeGB: osDiskSizeGb
      }
    }
    networkProfile: {
      networkInterfaces: [
        {
          id: nic.id
        }
      ]
    }
  }
}

// Market-hours cost control: stop daily (deallocate) at 16:00 JST by default
resource shutdown 'Microsoft.DevTestLab/schedules@2018-09-15' = {
  name: 'shutdown-computevm-${vmName}'
  location: location
  properties: {
    status: 'Enabled'
    taskType: 'ComputeVmShutdownTask'
    dailyRecurrence: {
      time: autoShutdownTime
    }
    timeZoneId: autoShutdownTimezone
    targetResourceId: vm.id
    notificationSettings: {
      status: 'Disabled'
    }
  }
}

output vmId string = vm.id
output publicIpAddress string = createPublicIp ? pip!.properties.ipAddress : 'none (Tailscale / private only)'
output rdpHint string = empty(rdpAllowedCidr)
  ? 'No public RDP. Use Tailscale. Optional: redeploy with rdpAllowedCidr=/32 and createPublicIp=true'
  : 'RDP CIDR rule present, but prefer Tailscale. Kabu ports remain denied from Internet.'
output nextSteps string = 'Install kabuステーション on VM, run scripts/Install-KabuHost.ps1, configure C:\\kabu-bridge\\.env'
