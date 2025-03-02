// Type definitions for Dynamics CRM Xrm object
declare namespace Xrm {
  namespace Page {
    namespace data {
      namespace entity {
        function getEntityName(): string;
        function getId(): string;
        function attributes(): {
          getAll(): Array<any>;
        };
      }
    }
  }
}

// Make Xrm available on the window object
interface Window {
  Xrm: typeof Xrm;
} 