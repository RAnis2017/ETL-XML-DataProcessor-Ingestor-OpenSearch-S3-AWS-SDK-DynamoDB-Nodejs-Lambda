module.exports = {
  dodgeTransformation: {
    project: {
      path: "Projects.Project",
      mapping: {
        DRNumber: "ProjectId",
        DodgeReportType: "ReportType",
      },
    },
    company: {
      parent: "project",
      path: "Companies.Company",
      mapping: {
        "Company.FactorType": "Role",
        "Company.FactorKey": "CompanyId",
        "Company.CKMSID": "ParticipantId",
      },
    },
    contact: {
      parent: "company",
      path: ".",
      mapping: {
        "HASH(Company.ContactName,Company.ContactEmail)": "Id",
        "Company.ContactTitle": "Title",
        "Company.ContactName": "Name",
        "Company.ContactEmail": "Email",
        "Company.ContactPhone": "Phone",
        "Company.FactorKey": "CompanyId",
        "FIRSTNAME(Company.ContactName)": "FirstName",
        "LASTNAME(Company.ContactName)": "LastName",
      },
    },
    projectCompanyRelation: {
      parents: ["project", "company"],
      "Project.DRNumber": "ProjectId",
      "Company.FactorKey": "CompanyId",
      "Company.FactorType": "Role",
    },
  },
};
