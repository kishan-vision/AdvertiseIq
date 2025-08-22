//DataBase Configration
require("../shared/connection");

// for registing package on worker 
require("../api-server/models/superAdmin/packages.model");

require('./jobs/campaign.job');
require('./jobs/configAds.job');
require('./jobs/placement.job');
require('./jobs/keyword.job');
require('./jobs/adGroups.job');